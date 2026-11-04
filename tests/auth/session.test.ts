// path: tests/auth/session.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import {
  normalizeIpSubnet,
  generateDeviceFingerprint,
  verifyDeviceFingerprint,
  createSession,
  getAndValidateSession,
  validateSessionRecord,
  revokeSession,
  revokeAllUserSessions,
  getActiveSessionsForUser,
  clearSessionRegistry,
  buildSessionCookieHeader,
  parseCookieHeader,
  parseCookieAttributes,
  formatClearSessionCookieHeader,
  encryptSessionToken,
  decryptSessionToken,
  extractSessionTokenFromRequest,
  validateSessionFromRequest,
  validateMiddlewareSession,
  IDLE_TIMEOUT_MS,
  ABSOLUTE_TIMEOUT_MS,
  MAX_CONCURRENT_SESSIONS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/auth';
import type { DeviceCharacteristics, UserSession } from '@/lib/auth';
import { SessionRepository } from '@/lib/db/sessions';
import { loadMigrationFiles } from '@/lib/database';
import { POST as loginPostHandler } from '@/app/api/auth/login/route';
import { UserRepository } from '@/lib/db/users';
import { AuditLogRepository } from '@/lib/db/audit';
import { hashPassword } from '@/lib/auth/password';

describe('LR-022 Session Engine with HttpOnly Secure SameSite=Strict Cookies (Step 055)', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const dbMigrationsDir = path.resolve(process.cwd(), 'db/migrations');

  beforeEach(() => {
    clearSessionRegistry();
  });

  describe('Device Fingerprint & IP Subnet Normalization', () => {
    it('should normalize IPv4 addresses to /24 subnet allowing intra-subnet cell tower roaming', () => {
      expect(normalizeIpSubnet('192.168.1.55')).toBe('192.168.1.0/24');
      expect(normalizeIpSubnet('192.168.1.99')).toBe('192.168.1.0/24');

      const dev1: DeviceCharacteristics = {
        ip: '192.168.1.55',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        acceptLanguage: 'en-US',
      };
      const dev2: DeviceCharacteristics = {
        ip: '192.168.1.99',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        acceptLanguage: 'en-US',
      };

      expect(generateDeviceFingerprint(dev1)).toBe(generateDeviceFingerprint(dev2));
      expect(verifyDeviceFingerprint(dev2, generateDeviceFingerprint(dev1))).toBe(true);
    });

    it('should invalidate fingerprint when client switches across IP subnets', () => {
      const homeDevice: DeviceCharacteristics = {
        ip: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      };
      const hijackedDevice: DeviceCharacteristics = {
        ip: '10.0.5.200', // Different subnet
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      };

      const homeHash = generateDeviceFingerprint(homeDevice);
      expect(verifyDeviceFingerprint(hijackedDevice, homeHash)).toBe(false);
    });

    it('should invalidate fingerprint when client User-Agent changes mid-flight', () => {
      const original: DeviceCharacteristics = {
        ip: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      };
      const alteredBrowser: DeviceCharacteristics = {
        ip: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      };

      const originalHash = generateDeviceFingerprint(original);
      expect(verifyDeviceFingerprint(alteredBrowser, originalHash)).toBe(false);
    });
  });

  describe('LR-022 Rolling Idle Timeout (15 Minutes)', () => {
    it('should permit access when idle time is under 15 minutes', () => {
      const now = Date.now();
      const device: DeviceCharacteristics = { ip: '192.168.1.10', userAgent: 'Chrome/120' };

      const session: UserSession = {
        id: 'sess_1',
        userId: 'user_1',
        sessionTokenHash: 'hash_1',
        deviceFingerprint: generateDeviceFingerprint(device),
        ipAddress: device.ip,
        userAgent: device.userAgent,
        createdAt: new Date(now - 30 * 60 * 1000).toISOString(), // 30m old
        lastActiveAt: new Date(now - 14 * 60 * 1000).toISOString(), // active 14m ago (<15m)
        expiresAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
      };

      const result = validateSessionRecord(session, device, now);
      expect(result.valid).toBe(true);
    });

    it('should invalidate session when idle time exceeds 15 minutes', () => {
      const now = Date.now();
      const device: DeviceCharacteristics = { ip: '192.168.1.10', userAgent: 'Chrome/120' };

      const session: UserSession = {
        id: 'sess_2',
        userId: 'user_1',
        sessionTokenHash: 'hash_2',
        deviceFingerprint: generateDeviceFingerprint(device),
        ipAddress: device.ip,
        userAgent: device.userAgent,
        createdAt: new Date(now - 20 * 60 * 1000).toISOString(),
        lastActiveAt: new Date(now - (IDLE_TIMEOUT_MS + 1000)).toISOString(), // 15m 1s ago
        expiresAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
      };

      const result = validateSessionRecord(session, device, now);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('EXPIRED_IDLE');
    });
  });

  describe('LR-022 Absolute Maximum Lifetime (8 Hours)', () => {
    it('should invalidate session exceeding 8 hours even if recently active', () => {
      const now = Date.now();
      const device: DeviceCharacteristics = { ip: '192.168.1.10', userAgent: 'Chrome/120' };

      const session: UserSession = {
        id: 'sess_3',
        userId: 'user_1',
        sessionTokenHash: 'hash_3',
        deviceFingerprint: generateDeviceFingerprint(device),
        ipAddress: device.ip,
        userAgent: device.userAgent,
        createdAt: new Date(now - (ABSOLUTE_TIMEOUT_MS + 1000)).toISOString(), // 8h 1s ago
        lastActiveAt: new Date(now - 2 * 60 * 1000).toISOString(), // active 2m ago
        expiresAt: new Date(now - 1000).toISOString(),
      };

      const result = validateSessionRecord(session, device, now);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('EXPIRED_ABSOLUTE');
    });
  });

  describe('LR-022 Concurrent Session Limit (Max 5 Sessions)', () => {
    it('should revoke oldest session when a user creates a 6th concurrent session', () => {
      const userId = 'user_concurrent_test';
      const device: DeviceCharacteristics = { ip: '192.168.1.100', userAgent: 'Chrome/120' };

      const createdSessions: UserSession[] = [];
      for (let i = 1; i <= MAX_CONCURRENT_SESSIONS; i++) {
        const sess = createSession({
          userId,
          token: `token_${i}`,
          device,
        });
        createdSessions.push(sess);
      }

      // User now has 5 active sessions
      expect(getActiveSessionsForUser(userId).length).toBe(5);

      // Create 6th session
      const sess6 = createSession({
        userId,
        token: 'token_6',
        device,
      });

      const active = getActiveSessionsForUser(userId);
      expect(active.length).toBe(5);

      // Verify oldest session (sess 1) was revoked
      const sess1 = createdSessions[0]!;
      const validation1 = getAndValidateSession('token_1', device);
      expect(validation1.valid).toBe(false);
      expect(sess1.revocationReason).toBe('CONCURRENT_LIMIT_EXCEEDED');

      // Verify newest session (sess 6) is active
      const validation6 = getAndValidateSession('token_6', device);
      expect(validation6.valid).toBe(true);
    });
  });

  describe('Session Revocation Management', () => {
    it('should explicitly revoke a session and reject subsequent requests', () => {
      const device: DeviceCharacteristics = { ip: '192.168.1.100', userAgent: 'Chrome/120' };
      const session = createSession({
        userId: 'user_revoke_test',
        token: 'token_to_revoke',
        device,
      });

      expect(revokeSession(session.id, 'USER_MANUAL_LOGOUT')).toBe(true);

      const validation = getAndValidateSession('token_to_revoke', device);
      expect(validation.valid).toBe(false);
      expect(validation.errorCode).toBe('REVOKED');
    });

    it('should revoke all other sessions preserving current session during global logout', () => {
      const userId = 'user_global_logout';
      const device: DeviceCharacteristics = { ip: '192.168.1.100', userAgent: 'Chrome/120' };

      const s1 = createSession({ userId, token: 't1', device });
      const s2 = createSession({ userId, token: 't2', device });
      const current = createSession({ userId, token: 'current_token', device });

      const revokedCount = revokeAllUserSessions(userId, current.id, 'PASSWORD_CHANGE');
      expect(revokedCount).toBe(2);

      expect(getAndValidateSession('t1', device).valid).toBe(false);
      expect(getAndValidateSession('t2', device).valid).toBe(false);
      expect(getAndValidateSession('current_token', device).valid).toBe(true);
    });
  });

  describe('Step 055.1: Database Migration Verification & Sessions Table', () => {
    it('should define sessions table with session_id UUIDv7, token_hash, device_id, and RLS enabled', () => {
      const migrations = loadMigrationFiles(migrationsDir);
      const sessionMigration = migrations.find((m) => m.name === 'create_sessions_table');

      expect(sessionMigration).toBeDefined();
      const sql = sessionMigration!.sql;

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.sessions');
      expect(sql).toContain('id uuid PRIMARY KEY DEFAULT generate_uuid_v7()');
      expect(sql).toContain('session_id uuid');
      expect(sql).toContain('user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE');
      expect(sql).toContain('token_hash varchar(64) NOT NULL UNIQUE');
      expect(sql).toContain('device_id varchar(128)');
      expect(sql).toContain('expires_at timestamptz NOT NULL');
      expect(sql).toContain('ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY');
    });

    it('should provide complete SessionRepository with CRUD and lookup by token hash', async () => {
      const sessionRepo = new SessionRepository();
      const testUserId = '018f6c4c-3500-7fa1-b1e2-100000000001';
      const tokenHash = 'a'.repeat(64);
      const expiresAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString();

      const created = await sessionRepo.create({
        user_id: testUserId,
        token_hash: tokenHash,
        device_id: 'dev_fingerprint_01',
        device_fingerprint: 'fp_hash_123',
        ip_address: '192.168.1.10',
        user_agent: 'Vitest Agent',
        last_active_at: new Date().toISOString(),
        expires_at: expiresAt,
        revoked_at: null,
        revocation_reason: null,
      });

      expect(created.id).toBeDefined();
      expect(created.user_id).toBe(testUserId);

      const found = await sessionRepo.findByTokenHash(tokenHash);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);

      const active = await sessionRepo.findActiveByUserId(testUserId);
      expect(active.length).toBeGreaterThan(0);

      const revoked = await sessionRepo.revoke(created.id, 'SECURITY_REVOKE');
      expect(revoked?.revoked_at).not.toBeNull();
      expect(revoked?.revocation_reason).toBe('SECURITY_REVOKE');
    });
  });

  describe('Step 055.2: createSession(userId, deviceContext) with Encrypted Session Cookie', () => {
    it('creates session using (userId, deviceContext) signature and issues encrypted cookie', () => {
      const userId = '018f6c4c-3500-7fa1-b1e2-200000000002';
      const device: DeviceCharacteristics = {
        ip: '203.0.113.15',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      };

      const session = createSession(userId, device);

      expect(session.id).toBeDefined();
      expect(session.userId).toBe(userId);
      expect(session.rawToken).toBeDefined();
      expect(session.rawToken).toHaveLength(64); // 32 random bytes hex
      expect(session.encryptedCookie).toBeDefined();
      expect(session.encryptedCookie).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+/);
      expect(session.cookieValue).toBeDefined();

      // Verify cookie value string contains strictly required LR-022 flags
      expect(session.cookieValue).toContain('kd_session=');
      expect(session.cookieValue).toContain('HttpOnly');
      expect(session.cookieValue).toContain('Secure');
      expect(session.cookieValue).toContain('SameSite=Strict');
      expect(session.cookieValue).toContain('Path=/');
      expect(session.cookieValue).toContain('Max-Age=28800');
    });

    it('round-trip encrypts and decrypts session tokens cleanly via AES-256-GCM', () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const encrypted = encryptSessionToken(rawToken);

      expect(encrypted).not.toBe(rawToken);
      expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+/);

      const decrypted = decryptSessionToken(encrypted);
      expect(decrypted).toBe(rawToken);
    });

    it('validates session seamlessly when given encrypted cookie token value', () => {
      const userId = '018f6c4c-3500-7fa1-b1e2-300000000003';
      const device: DeviceCharacteristics = {
        ip: '198.51.100.22',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      };

      const session = createSession(userId, device);
      const encryptedToken = session.encryptedCookie!;

      // Validate passing encrypted token from client cookie
      const validation = getAndValidateSession(encryptedToken, device);
      expect(validation.valid).toBe(true);
      expect(validation.session?.id).toBe(session.id);
      expect(validation.session?.userId).toBe(userId);
    });
  });

  describe('Step 055.3: Next.js Middleware Session Validator', () => {
    it('extracts session token from Cookie header and validates request', () => {
      const userId = '018f6c4c-3500-7fa1-b1e2-400000000004';
      const device: DeviceCharacteristics = {
        ip: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      };

      const session = createSession(userId, device);
      const cookieHeader = `theme=dark; kd_session=${encodeURIComponent(session.encryptedCookie!)}; lang=en`;

      const request = new Request('http://localhost:3000/dashboard', {
        headers: {
          cookie: cookieHeader,
          'x-forwarded-for': device.ip,
          'user-agent': device.userAgent,
        },
      });

      const extracted = extractSessionTokenFromRequest(request);
      expect(extracted).toBe(session.encryptedCookie);

      const validation = validateSessionFromRequest(request);
      expect(validation.valid).toBe(true);
      expect(validation.session?.userId).toBe(userId);

      const middlewareResult = validateMiddlewareSession(request);
      expect(middlewareResult.authenticated).toBe(true);
      expect(middlewareResult.session?.id).toBe(session.id);
    });

    it('rejects middleware session validation when cookie is missing or invalid', () => {
      const request = new Request('http://localhost:3000/api/files', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'user-agent': 'Chrome/120',
        },
      });

      const validation = validateSessionFromRequest(request);
      expect(validation.valid).toBe(false);
      expect(validation.errorCode).toBe('NOT_FOUND');

      const middlewareResult = validateMiddlewareSession(request);
      expect(middlewareResult.authenticated).toBe(false);
      expect(middlewareResult.error).toContain('No session token');
    });

    it('falls back to Authorization Bearer header when cookie is not present', () => {
      const userId = '018f6c4c-3500-7fa1-b1e2-500000000005';
      const device: DeviceCharacteristics = {
        ip: '10.0.0.1',
        userAgent: 'API Client / v1',
      };

      const session = createSession(userId, device);

      const request = new Request('http://localhost:3000/api/compliance/audit/verify', {
        headers: {
          authorization: `Bearer ${session.rawToken}`,
          'x-forwarded-for': device.ip,
          'user-agent': device.userAgent,
        },
      });

      const middlewareResult = validateMiddlewareSession(request);
      expect(middlewareResult.authenticated).toBe(true);
      expect(middlewareResult.session?.userId).toBe(userId);
    });
  });

  describe('Step 055.4: Cookie Attributes Security Compliance & Quality Gate', () => {
    it('strictly enforces HttpOnly, Secure, SameSite=Strict, Path=/, and Max-Age=28800 on generated session cookie', () => {
      const token = 'test_token_secret_123';
      const cookieHeader = buildSessionCookieHeader(token);

      const parsed = parseCookieAttributes(cookieHeader);

      expect(parsed.name).toBe(SESSION_COOKIE_NAME);
      expect(parsed.value).toBe(token);
      expect(parsed.httpOnly).toBe(true);
      expect(parsed.secure).toBe(true);
      expect(parsed.sameSite?.toLowerCase()).toBe('strict');
      expect(parsed.path).toBe('/');
      expect(parsed.maxAge).toBe(SESSION_COOKIE_MAX_AGE_SECONDS);
      expect(parsed.maxAge).toBe(28800); // exactly 8 hours
    });

    it('provides clear session cookie header with immediate Max-Age=0 expiration for logout', () => {
      const clearHeader = formatClearSessionCookieHeader();
      const parsed = parseCookieAttributes(clearHeader);

      expect(parsed.name).toBe(SESSION_COOKIE_NAME);
      expect(parsed.value).toBe('');
      expect(parsed.httpOnly).toBe(true);
      expect(parsed.secure).toBe(true);
      expect(parsed.sameSite?.toLowerCase()).toBe('strict');
      expect(parsed.path).toBe('/');
      expect(parsed.maxAge).toBe(0);
      expect(parsed.expires).toContain('1970');
    });

    it('Quality Gate: Set-Cookie header on successful /api/auth/login strictly complies with HttpOnly, Secure, and SameSite=Strict', async () => {
      const userRepo = new UserRepository();
      const auditRepo = new AuditLogRepository();

      const email = 'strict.session.merchant@kdsolution.it';
      const rawPassword = 'Password_1234_StrictSession!';
      const passwordHash = await hashPassword(rawPassword);

      const user = await userRepo.create({
        company_id: '018f6c4c-3500-7fa1-b1e2-000000000001',
        email,
        full_legal_name: 'Strict Session Merchant',
        password_hash: passwordHash,
        password_changed_at: new Date().toISOString(),
        status: 'active',
        is_staff: false,
        failed_attempts: 0,
        locked_until: null,
      });

      const loginReq = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.99',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        body: JSON.stringify({
          email,
          password: rawPassword,
        }),
      });

      const response = await loginPostHandler(loginReq, { userRepo, auditRepo });
      expect(response.status).toBe(200);

      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).not.toBeNull();

      // Parse and strictly verify LR-022 cookie attributes
      const attrs = parseCookieAttributes(setCookie!);
      expect(attrs.name).toBe('kd_session');
      expect(attrs.value.length).toBeGreaterThan(0);
      expect(attrs.httpOnly).toBe(true);
      expect(attrs.secure).toBe(true);
      expect(attrs.sameSite?.toLowerCase()).toBe('strict');
      expect(attrs.path).toBe('/');
      expect(attrs.maxAge).toBe(28800);
    });
  });
});
