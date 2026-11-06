// path: tests/auth/session-kill.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  getAndValidateSession,
  clearSessionRegistry,
  logout,
  revokeAllSessions,
  handlePasswordChangeSessionRevocation,
  validateMiddlewareSession,
} from '@/lib/auth';
import type { DeviceCharacteristics } from '@/lib/auth';
import { POST as logoutPostHandler } from '@/app/api/auth/logout/route';
import { POST as revokeAllPostHandler } from '@/app/api/auth/revoke-all/route';
import { SessionRepository } from '@/lib/db/sessions';
import { AuditLogRepository } from '@/lib/db/audit';
import { UserRepository } from '@/lib/db/users';
import { hashPassword } from '@/lib/auth/password';

describe('Step 059: Instant Session Invalidation API & Global Kill-Switch', () => {
  let sessionRepo: SessionRepository;
  let auditRepo: AuditLogRepository;
  let userRepo: UserRepository;

  const testUserId = '018f6c4c-3500-7fa1-b1e2-555555555555';
  const testCompanyId = '018f6c4c-3500-7fa1-b1e2-000000000001';

  beforeEach(async () => {
    clearSessionRegistry();
    sessionRepo = new SessionRepository();
    auditRepo = new AuditLogRepository();
    userRepo = new UserRepository();

    await userRepo.createUser({
      id: testUserId,
      email: 'killswitch.user@kdsolution.it',
      full_legal_name: 'Kill Switch Test User',
      password_hash: await hashPassword('SecurePass123!'),
      company_id: testCompanyId,
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
      is_staff: false,
    });
  });

  describe('Step 059.1: Single-Session Logout (`logout`)', () => {
    it('revokes session in memory and PostgreSQL, clears cookies, and writes audit log', async () => {
      const device: DeviceCharacteristics = { ip: '192.0.2.10', userAgent: 'Chrome Desktop' };
      const session = createSession(testUserId, device, { tenantId: testCompanyId });

      // Persist in repository
      await sessionRepo.create({
        session_id: session.id,
        user_id: testUserId,
        company_id: testCompanyId,
        session_family_id: session.sessionFamilyId,
        token_hash: 'mock_token_hash_logout_01',
        device_fingerprint: 'mock_fp_01',
        ip_address: device.ip,
        user_agent: device.userAgent,
        expires_at: session.expiresAt,
        last_active_at: session.lastActiveAt,
      });

      const logoutResult = await logout(session.id, {
        sessionRepo,
        auditRepo,
        reason: 'USER_LOGOUT',
      });

      expect(logoutResult.success).toBe(true);
      expect(logoutResult.sessionId).toBe(session.id);
      expect(logoutResult.clearCookieHeaders.length).toBeGreaterThanOrEqual(2);
      expect(logoutResult.clearCookieHeaders[0]).toContain('Max-Age=0');
      expect(logoutResult.clearCookieHeaders[0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

      // Verify session validation immediately fails
      const validation = getAndValidateSession(session.rawToken!, device);
      expect(validation.valid).toBe(false);
      expect(validation.errorCode).toBe('REVOKED');

      // Verify database record is marked as revoked
      const dbRecord = await sessionRepo.findBySessionId(session.id);
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.is_revoked).toBe(true);
      expect(dbRecord?.revoked_at).not.toBeNull();

      // Verify audit log has SESSION_REVOKED
      const auditRecords = await auditRepo.findMany();
      const logoutAudit = auditRecords.find(
        (a) => a.action === 'SESSION_REVOKED' && a.entity_id === session.id
      );
      expect(logoutAudit).toBeDefined();
      expect(logoutAudit?.actor_id).toBe(testUserId);
    });

    it('handles logout gracefully when session ID is missing or already expired', async () => {
      const result = await logout(null, { sessionRepo, auditRepo });
      expect(result.success).toBe(true);
      expect(result.clearCookieHeaders.length).toBeGreaterThanOrEqual(1);
      expect(result.clearCookieHeaders[0]).toContain('Max-Age=0');
    });

    it('POST /api/auth/logout terminates session and sets Set-Cookie headers', async () => {
      const device: DeviceCharacteristics = { ip: '198.51.100.4', userAgent: 'Firefox Browser' };
      const session = createSession(testUserId, device, { tenantId: testCompanyId });

      const request = new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          Cookie: `kd_session=${session.encryptedCookie}`,
          'User-Agent': device.userAgent,
          'X-Forwarded-For': device.ip,
        },
      });

      const res = await logoutPostHandler(request, { sessionRepo, auditRepo });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('Max-Age=0');

      // Session is now revoked
      const validation = getAndValidateSession(session.rawToken!, device);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Step 059.2: Global Account Session Revocation (`revokeAllSessions`)', () => {
    it('revokes all active sessions across multiple devices for a user in memory and repository', async () => {
      // Create 3 sessions on different devices
      const device1: DeviceCharacteristics = { ip: '10.0.0.1', userAgent: 'Device 1 Safari' };
      const device2: DeviceCharacteristics = { ip: '10.0.0.2', userAgent: 'Device 2 Chrome' };
      const device3: DeviceCharacteristics = { ip: '10.0.0.3', userAgent: 'Device 3 Firefox' };

      const s1 = createSession(testUserId, device1);
      const s2 = createSession(testUserId, device2);
      const s3 = createSession(testUserId, device3);

      await sessionRepo.create({
        session_id: s1.id,
        user_id: testUserId,
        company_id: testCompanyId,
        session_family_id: s1.sessionFamilyId,
        token_hash: 'hash_s1',
        device_fingerprint: 'fp1',
        ip_address: device1.ip,
        user_agent: device1.userAgent,
        expires_at: s1.expiresAt,
        last_active_at: s1.lastActiveAt,
      });

      await sessionRepo.create({
        session_id: s2.id,
        user_id: testUserId,
        company_id: testCompanyId,
        session_family_id: s2.sessionFamilyId,
        token_hash: 'hash_s2',
        device_fingerprint: 'fp2',
        ip_address: device2.ip,
        user_agent: device2.userAgent,
        expires_at: s2.expiresAt,
        last_active_at: s2.lastActiveAt,
      });

      await sessionRepo.create({
        session_id: s3.id,
        user_id: testUserId,
        company_id: testCompanyId,
        session_family_id: s3.sessionFamilyId,
        token_hash: 'hash_s3',
        device_fingerprint: 'fp3',
        ip_address: device3.ip,
        user_agent: device3.userAgent,
        expires_at: s3.expiresAt,
        last_active_at: s3.lastActiveAt,
      });

      // Verify all 3 sessions are currently valid
      expect(getAndValidateSession(s1.rawToken!, device1).valid).toBe(true);
      expect(getAndValidateSession(s2.rawToken!, device2).valid).toBe(true);
      expect(getAndValidateSession(s3.rawToken!, device3).valid).toBe(true);

      // Execute global revocation
      const revokeResult = await revokeAllSessions(testUserId, {
        sessionRepo,
        auditRepo,
        reason: 'USER_KILL_SWITCH',
      });

      expect(revokeResult.success).toBe(true);
      expect(revokeResult.revokedCount).toBe(3);
      expect(revokeResult.reason).toBe('USER_KILL_SWITCH');

      // Verify all 3 sessions are now revoked
      expect(getAndValidateSession(s1.rawToken!, device1).valid).toBe(false);
      expect(getAndValidateSession(s2.rawToken!, device2).valid).toBe(false);
      expect(getAndValidateSession(s3.rawToken!, device3).valid).toBe(false);

      // Verify repository records are revoked
      const activeDbSessions = await sessionRepo.findActiveByUserId(testUserId);
      expect(activeDbSessions.length).toBe(0);

      // Verify GLOBAL_SESSION_REVOCATION audit log
      const logs = await auditRepo.findMany();
      const globalAudit = logs.find((l) => l.action === 'GLOBAL_SESSION_REVOCATION');
      expect(globalAudit).toBeDefined();
      expect(globalAudit?.actor_id).toBe(testUserId);
      expect(globalAudit?.payload.totalRevokedCount).toBe(3);
    });

    it('POST /api/auth/revoke-all terminates all sessions and returns 200', async () => {
      const device: DeviceCharacteristics = { ip: '172.16.0.5', userAgent: 'Test Device' };
      const s1 = createSession(testUserId, device);

      const request = new Request('http://localhost:3000/api/auth/revoke-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `kd_session=${s1.encryptedCookie}`,
          'User-Agent': device.userAgent,
          'X-Forwarded-For': device.ip,
        },
        body: JSON.stringify({ reason: 'SUSPECTED_COMPROMISE' }),
      });

      const res = await revokeAllPostHandler(request, { sessionRepo, auditRepo });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.user_id).toBe(testUserId);
      expect(json.reason).toBe('SUSPECTED_COMPROMISE');

      // Session is revoked
      expect(getAndValidateSession(s1.rawToken!, device).valid).toBe(false);
    });

    it('POST /api/auth/revoke-all rejects unauthenticated requests with 401', async () => {
      const request = new Request('http://localhost:3000/api/auth/revoke-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await revokeAllPostHandler(request, { sessionRepo, auditRepo });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.title).toBe('Authentication Required');
    });
  });

  describe('Step 059.3: Automatic Revocation Triggers (Password Change & Security Alerts)', () => {
    it('automatically terminates all sessions when handlePasswordChangeSessionRevocation is called', async () => {
      const device1: DeviceCharacteristics = { ip: '192.168.1.10', userAgent: 'Mac Safari' };
      const device2: DeviceCharacteristics = { ip: '192.168.1.20', userAgent: 'Windows Chrome' };

      const s1 = createSession(testUserId, device1);
      const s2 = createSession(testUserId, device2);

      expect(getAndValidateSession(s1.rawToken!, device1).valid).toBe(true);
      expect(getAndValidateSession(s2.rawToken!, device2).valid).toBe(true);

      // User changes password
      const result = await handlePasswordChangeSessionRevocation(testUserId, {
        sessionRepo,
        auditRepo,
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe('PASSWORD_CHANGED');
      expect(result.revokedCount).toBe(2);

      // Both devices are invalidated
      expect(getAndValidateSession(s1.rawToken!, device1).valid).toBe(false);
      expect(getAndValidateSession(s2.rawToken!, device2).valid).toBe(false);
    });
  });

  describe('Step 059.4 & Quality Gate: 3-Browser Session Termination', () => {
    it('Quality Gate: User with 3 active browser sessions is terminated across all browsers upon calling revokeAllSessions; subsequent requests fail validation', async () => {
      // 1. Setup: User opens 3 active sessions across 3 distinct browsers
      const browserA: DeviceCharacteristics = {
        ip: '203.0.113.11',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
      };
      const browserB: DeviceCharacteristics = {
        ip: '203.0.113.22',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Firefox/125.0',
      };
      const browserC: DeviceCharacteristics = {
        ip: '203.0.113.33',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Mobile/15E148 Safari/604.1',
      };

      const sessionA = createSession(testUserId, browserA, { tenantId: testCompanyId });
      const sessionB = createSession(testUserId, browserB, { tenantId: testCompanyId });
      const sessionC = createSession(testUserId, browserC, { tenantId: testCompanyId });

      // Persist in repository
      for (const [sess, dev] of [
        [sessionA, browserA],
        [sessionB, browserB],
        [sessionC, browserC],
      ] as const) {
        await sessionRepo.create({
          session_id: sess.id,
          user_id: testUserId,
          company_id: testCompanyId,
          session_family_id: sess.sessionFamilyId,
          token_hash: `token_hash_${sess.id}`,
          device_fingerprint: `fp_${sess.id}`,
          ip_address: dev.ip,
          user_agent: dev.userAgent,
          expires_at: sess.expiresAt,
          last_active_at: sess.lastActiveAt,
        });
      }

      // 2. Verify all 3 sessions are initially healthy and valid
      expect(getAndValidateSession(sessionA.rawToken!, browserA).valid).toBe(true);
      expect(getAndValidateSession(sessionB.rawToken!, browserB).valid).toBe(true);
      expect(getAndValidateSession(sessionC.rawToken!, browserC).valid).toBe(true);

      // 3. Browser A triggers POST /api/auth/revoke-all
      const revokeReq = new Request('http://localhost:3000/api/auth/revoke-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `kd_session=${sessionA.encryptedCookie}`,
          'User-Agent': browserA.userAgent,
          'X-Forwarded-For': browserA.ip,
        },
        body: JSON.stringify({ reason: 'SECURITY_KILL_SWITCH_TEST' }),
      });

      const revokeRes = await revokeAllPostHandler(revokeReq, { sessionRepo, auditRepo });
      expect(revokeRes.status).toBe(200);
      const revokeData = await revokeRes.json();
      expect(revokeData.success).toBe(true);
      expect(revokeData.revoked_count).toBe(3);

      // 4. Verify subsequent requests from ALL 3 browsers fail validation immediately
      const validateResultA = getAndValidateSession(sessionA.rawToken!, browserA);
      expect(validateResultA.valid).toBe(false);
      expect(validateResultA.errorCode).toBe('REVOKED');

      const validateResultB = getAndValidateSession(sessionB.rawToken!, browserB);
      expect(validateResultB.valid).toBe(false);
      expect(validateResultB.errorCode).toBe('REVOKED');

      const validateResultC = getAndValidateSession(sessionC.rawToken!, browserC);
      expect(validateResultC.valid).toBe(false);
      expect(validateResultC.errorCode).toBe('REVOKED');

      // 5. Verify middleware validation marks requests from any of the 3 browsers as unauthenticated
      const mockReqB = new Request('http://localhost:3000/dashboard', {
        headers: {
          Cookie: `kd_session=${sessionB.encryptedCookie}`,
          'User-Agent': browserB.userAgent,
          'X-Forwarded-For': browserB.ip,
        },
      });

      const middlewareResult = validateMiddlewareSession(mockReqB);
      expect(middlewareResult.authenticated).toBe(false);
      expect(middlewareResult.error).toContain('revoked');
    });
  });
});
