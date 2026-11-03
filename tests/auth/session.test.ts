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
  IDLE_TIMEOUT_MS,
  ABSOLUTE_TIMEOUT_MS,
  MAX_CONCURRENT_SESSIONS,
} from '@/lib/auth';
import type { DeviceCharacteristics, UserSession } from '@/lib/auth';
import { loadMigrationFiles } from '@/lib/database';

describe('LR-022 Session Security Engine & Ephemeral Device Binding (Step 013)', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

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

  describe('Database Migration Verification', () => {
    it('should define user_sessions table with device fingerprint and RLS enabled', () => {
      const migrations = loadMigrationFiles(migrationsDir);
      const sessionMigration = migrations.find((m) => m.name === 'create_user_sessions_table');

      expect(sessionMigration).toBeDefined();
      const sql = sessionMigration!.sql;

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_sessions');
      expect(sql).toContain('device_fingerprint VARCHAR(64) NOT NULL');
      expect(sql).toContain('session_token_hash VARCHAR(64) NOT NULL UNIQUE');
      expect(sql).toContain('ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain("current_setting('app.current_user_id', true)");
    });
  });
});
