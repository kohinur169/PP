// path: tests/auth/lockout.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordFailedLoginAttempt,
  checkLockoutGuard,
  canInitiatePasswordReset,
  MAX_CONSECUTIVE_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  LOCKOUT_DURATION_HOURS,
} from '../../lib/auth/lockout';
import { authenticateUser } from '../../lib/auth/login';
import { hashPassword } from '../../lib/auth/password';
import { UserRepository } from '../../lib/db/users';
import { AuditLogRepository } from '../../lib/db/audit';
import type { DeviceCharacteristics } from '../../lib/auth/session-types';

describe('Step 050: Persistent 2-Hour Account Lockout on 2 Consecutive Failed Attempts', () => {
  let userRepo: UserRepository;
  let auditRepo: AuditLogRepository;
  const testPassword = 'Correct#Horse#Battery#Staple#2026!';
  let testUserId: string;
  let testUserEmail: string;

  const testDevice: DeviceCharacteristics = {
    ip: '198.51.100.101',
    userAgent: 'LockoutSecurityTest/1.0',
    acceptLanguage: 'en-US',
  };

  beforeEach(async () => {
    userRepo = new UserRepository();
    auditRepo = new AuditLogRepository();

    testUserEmail = `lockout.target.${Date.now()}.${Math.random().toString(36).substring(2, 6)}@kdsolution.it`;
    const passwordHash = await hashPassword(testPassword);

    const user = await userRepo.createUser({
      email: testUserEmail,
      full_legal_name: 'Antonio Vivaldi',
      password_hash: passwordHash,
      status: 'active',
      is_staff: false,
      failed_attempts: 0,
      locked_until: null,
    });
    testUserId = user.id;
  });

  describe('Step 050.1 & Step 050.2: 2 Failed Attempts Trigger 2-Hour Lockout & Dispatch Security Email', () => {
    it('records first failed attempt without locking account', async () => {
      let emailDispatched = false;
      const res = await recordFailedLoginAttempt(testUserId, {
        userRepo,
        auditRepo,
        emailDispatcher: () => {
          emailDispatched = true;
          return true;
        },
      });

      expect(res.failedAttempts).toBe(1);
      expect(res.locked).toBe(false);
      expect(res.lockedUntil).toBeNull();
      expect(res.emailDispatched).toBe(false);
      expect(emailDispatched).toBe(false);

      const dbUser = await userRepo.findById(testUserId);
      expect(dbUser?.failed_attempts).toBe(1);
      expect(dbUser?.locked_until).toBeNull();
      expect(dbUser?.status).toBe('active');
    });

    it('Quality Gate: 2nd consecutive failed attempt locks account for exactly 2 hours and dispatches email', async () => {
      let emailDispatched = false;
      let emailRecipient = '';
      let emailLockedUntil = '';

      const options = {
        userRepo,
        auditRepo,
        emailDispatcher: (params: { email: string; userId: string; lockedUntil: string }) => {
          emailDispatched = true;
          emailRecipient = params.email;
          emailLockedUntil = params.lockedUntil;
          return true;
        },
      };

      // 1st failed attempt
      await recordFailedLoginAttempt(testUserId, options);

      // 2nd failed attempt
      const startTime = Date.now();
      const res = await recordFailedLoginAttempt(testUserId, options);

      expect(res.failedAttempts).toBe(2);
      expect(res.locked).toBe(true);
      expect(res.lockedUntil).not.toBeNull();
      expect(res.emailDispatched).toBe(true);

      // Verify email was dispatched
      expect(emailDispatched).toBe(true);
      expect(emailRecipient).toBe(testUserEmail.toLowerCase());
      expect(emailLockedUntil).toBe(res.lockedUntil);

      // Verify lock duration is exactly 2 hours (within 2 seconds tolerance)
      const lockExpiryMs = new Date(res.lockedUntil!).getTime();
      const expectedExpiry = startTime + LOCKOUT_DURATION_MS;
      expect(Math.abs(lockExpiryMs - expectedExpiry)).toBeLessThan(2000);

      // Verify persisted state in database
      const dbUser = await userRepo.findById(testUserId);
      expect(dbUser?.status).toBe('locked');
      expect(dbUser?.failed_attempts).toBe(2);
      expect(dbUser?.locked_until).toBe(res.lockedUntil);

      // Verify audit log entry
      const logs = await auditRepo.findMany();
      const lockLog = logs.find(
        (l) => l.action === 'ACCOUNT_LOCKED' && l.entity_id === testUserId
      );
      expect(lockLog).toBeDefined();
      expect(lockLog?.payload.cooldownHours).toBe(LOCKOUT_DURATION_HOURS);
      expect(lockLog?.payload.failedAttempts).toBe(MAX_CONSECUTIVE_FAILED_ATTEMPTS);
    });
  });

  describe('Step 050.3: Lockout Guard Rejects Authentication Even With Correct Credentials', () => {
    it('rejects authentication with correct password while actively locked', async () => {
      // Trigger 2-hour lock
      await recordFailedLoginAttempt(testUserId, { userRepo, auditRepo });
      await recordFailedLoginAttempt(testUserId, { userRepo, auditRepo });

      // Attempt login with CORRECT password
      const authResult = await authenticateUser(
        {
          email: testUserEmail,
          password: testPassword,
          device: testDevice,
        },
        { userRepo, auditRepo }
      );

      expect(authResult.success).toBe(false);
      expect(authResult.error).toBe('ACCOUNT_LOCKED');
      expect(authResult.message).toContain('Account is temporarily locked');
      expect(authResult.session).toBeUndefined();
    });

    it('automatically releases lockout after 2 hours have elapsed', async () => {
      const now = Date.now();
      // Lock account at current time
      await recordFailedLoginAttempt(testUserId, { userRepo, auditRepo, nowMs: now });
      await recordFailedLoginAttempt(testUserId, { userRepo, auditRepo, nowMs: now });

      // Guard check immediately: must be locked
      const immediateGuard = await checkLockoutGuard(testUserId, {
        userRepo,
        auditRepo,
        nowMs: now,
      });
      expect(immediateGuard.locked).toBe(true);
      expect(immediateGuard.remainingSeconds).toBeGreaterThan(7190);

      // Simulate passage of 2 hours and 1 minute (7260 seconds later)
      const futureNow = now + LOCKOUT_DURATION_MS + 60 * 1000;
      const futureGuard = await checkLockoutGuard(testUserId, {
        userRepo,
        auditRepo,
        nowMs: futureNow,
      });

      expect(futureGuard.locked).toBe(false);
      expect(futureGuard.lockedUntil).toBeNull();
      expect(futureGuard.remainingSeconds).toBe(0);

      // Verify user record in database automatically transitioned back to active with zero failed attempts
      const user = await userRepo.findById(testUserId);
      expect(user?.status).toBe('active');
      expect(user?.failed_attempts).toBe(0);
      expect(user?.locked_until).toBeNull();
    });
  });

  describe('Step 050.4: Password Reset Lockout Guard', () => {
    it('forbids initiating password reset while account is actively locked', async () => {
      // 1. Unlocked account allows password reset
      const preLockCheck = await canInitiatePasswordReset(testUserId, {
        userRepo,
        auditRepo,
      });
      expect(preLockCheck.permitted).toBe(true);

      // 2. Lock account
      await recordFailedLoginAttempt(testUserId, { userRepo, auditRepo });
      await recordFailedLoginAttempt(testUserId, { userRepo, auditRepo });

      // 3. Locked account strictly forbids password reset
      const postLockCheck = await canInitiatePasswordReset(testUserId, {
        userRepo,
        auditRepo,
      });
      expect(postLockCheck.permitted).toBe(false);
      expect(postLockCheck.reason).toContain('Password reset is strictly forbidden while an account is under active security lockout');
    });

    it('allows password reset after 2-hour lockout cooldown expires', async () => {
      const now = Date.now();
      await recordFailedLoginAttempt(testUserId, { userRepo, auditRepo, nowMs: now });
      await recordFailedLoginAttempt(testUserId, { userRepo, auditRepo, nowMs: now });

      // Fast-forward past 2 hours
      const futureNow = now + LOCKOUT_DURATION_MS + 5000;
      const futureCheck = await canInitiatePasswordReset(testUserId, {
        userRepo,
        auditRepo,
        nowMs: futureNow,
      });

      expect(futureCheck.permitted).toBe(true);
    });
  });
});
