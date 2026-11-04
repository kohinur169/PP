// path: tests/auth/step-up.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueStepUpTicket,
  verifyStepUpTicket,
  consumeStepUpTicket,
  withStepUpGuard,
  clearStepUpRegistry,
  createStepUpChallenge,
  requireStepUpAuth,
  updateSessionReauthTimestamp,
  executeStepUpVerification,
  REAUTH_GRACE_PERIOD_MS,
  createSession,
  clearSessionRegistry,
} from '@/lib/auth';
import type { DeviceCharacteristics } from '@/lib/auth';
import { POST as stepUpPostHandler } from '@/app/api/auth/step-up/route';
import { UserRepository } from '@/lib/db/users';
import { UserMfaRepository } from '@/lib/db/mfa';
import { SessionRepository } from '@/lib/db/sessions';
import { AuditLogRepository } from '@/lib/db/audit';
import { hashPassword } from '@/lib/auth/password';
import { generateTotpSecret, generateTotp } from '@/lib/auth/totp';

describe('Step-Up Reauthentication & Sensitive Action Gating (Step 014 & Step 058)', () => {
  const userId = 'user_stepup_01';

  beforeEach(() => {
    clearStepUpRegistry();
    clearSessionRegistry();
  });

  describe('Ticket Issuance & 5-Minute Grace Period Expiration', () => {
    it('should grant a reauthentication ticket valid for 5 minutes', () => {
      const now = Date.now();
      const ticket = issueStepUpTicket(userId, 'MODIFY_BANK_ACCOUNT');

      expect(ticket.id).toMatch(/^ticket_/);
      expect(ticket.userId).toBe(userId);
      expect(ticket.action).toBe('MODIFY_BANK_ACCOUNT');
      expect(new Date(ticket.expiresAt).getTime() - now).toBeCloseTo(REAUTH_GRACE_PERIOD_MS, -2);
    });

    it('should validate ticket within the 5-minute window', () => {
      const now = Date.now();
      const ticket = issueStepUpTicket(userId, 'MODIFY_BANK_ACCOUNT');

      // 4 minutes 59 seconds later (still valid)
      const fourMinsLater = now + 4 * 60 * 1000 + 59 * 1000;
      expect(verifyStepUpTicket(ticket.id, userId, 'MODIFY_BANK_ACCOUNT', fourMinsLater)).toBe(true);
    });

    it('should reject stale reauthentication tickets exceeding 5 minutes', () => {
      const now = Date.now();
      const ticket = issueStepUpTicket(userId, 'MODIFY_BANK_ACCOUNT');

      // 5 minutes + 1 second later (expired)
      const expiredTime = now + REAUTH_GRACE_PERIOD_MS + 1000;
      expect(verifyStepUpTicket(ticket.id, userId, 'MODIFY_BANK_ACCOUNT', expiredTime)).toBe(false);
    });
  });

  describe('Action & User Boundary Protection', () => {
    it('should reject tickets used for a different sensitive action than granted', () => {
      const ticket = issueStepUpTicket(userId, 'MODIFY_BANK_ACCOUNT');

      // Attempt to use bank account ticket to revoke API key
      const isAllowed = verifyStepUpTicket(ticket.id, userId, 'REVOKE_API_KEY');
      expect(isAllowed).toBe(false);
    });

    it('should reject tickets presented by a different user', () => {
      const ticket = issueStepUpTicket(userId, 'ALTER_RISK_TIER');

      // Attacker attempts to use another user's ticket
      const isAllowed = verifyStepUpTicket(ticket.id, 'attacker_user_99', 'ALTER_RISK_TIER');
      expect(isAllowed).toBe(false);
    });
  });

  describe('One-Time Ticket Consumption (Replay Prevention)', () => {
    it('should consume ticket on first use and reject replay attempts', () => {
      const ticket = issueStepUpTicket(userId, 'FREEZE_PAYOUTS');

      // First consumption succeeds
      expect(consumeStepUpTicket(ticket.id, userId, 'FREEZE_PAYOUTS')).toBe(true);

      // Replay attempt fails
      expect(consumeStepUpTicket(ticket.id, userId, 'FREEZE_PAYOUTS')).toBe(false);
      expect(verifyStepUpTicket(ticket.id, userId, 'FREEZE_PAYOUTS')).toBe(false);
    });
  });

  describe('withStepUpGuard Interceptor & Challenge Issuance', () => {
    it('should issue Step-Up Challenge when ticket is missing', async () => {
      const result = await withStepUpGuard(
        {
          userId,
          action: 'MODIFY_BANK_ACCOUNT',
          ticketId: undefined,
        },
        async () => {
          return { bankUpdated: true };
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.challengeRequired).toBe(true);
        expect(result.action).toBe('MODIFY_BANK_ACCOUNT');
        expect(result.message).toContain('Step-up reauthentication required');
      }
    });

    it('should issue Step-Up Challenge when ticket is expired', async () => {
      const now = Date.now();
      const ticket = issueStepUpTicket(userId, 'TRANSFER_OWNERSHIP');

      const expiredTime = now + REAUTH_GRACE_PERIOD_MS + 2000;
      const result = await withStepUpGuard(
        {
          userId,
          action: 'TRANSFER_OWNERSHIP',
          ticketId: ticket.id,
        },
        async () => {
          return { ownershipTransferred: true };
        },
        expiredTime
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.challengeRequired).toBe(true);
      }
    });

    it('should execute protected handler and consume ticket when valid ticket is supplied', async () => {
      const ticket = issueStepUpTicket(userId, 'ROTATE_WEBHOOK_SECRET');

      const result = await withStepUpGuard(
        {
          userId,
          action: 'ROTATE_WEBHOOK_SECRET',
          ticketId: ticket.id,
        },
        async () => {
          return { secretRotated: true, newSecret: 'whsec_test_018f6c4c' };
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.secretRotated).toBe(true);
        expect(result.data.newSecret).toBe('whsec_test_018f6c4c');
      }

      // Verify ticket was consumed and cannot be reused
      expect(verifyStepUpTicket(ticket.id, userId, 'ROTATE_WEBHOOK_SECRET')).toBe(false);
    });
  });

  describe('Step 058.1: requireStepUpAuth Session Timestamp Guard', () => {
    it('permits operation when session was reauthenticated within 300 seconds', () => {
      const now = Date.now();
      const session = {
        last_reauth_at: new Date(now - 120 * 1000).toISOString(), // 2 minutes ago (< 300s)
      };

      const result = requireStepUpAuth(session, 300, now);
      expect(result.stepUpRequired).toBe(false);
      expect(result.secondsSinceReauth).toBe(120);
    });

    it('demands step-up verification when session last_reauth_at is missing', () => {
      const session = { last_reauth_at: null };
      const result = requireStepUpAuth(session, 300);

      expect(result.stepUpRequired).toBe(true);
      expect(result.secondsSinceReauth).toBeNull();
      expect(result.message).toContain('No previous verification found');
    });

    it('demands step-up verification when reauthentication is stale (>300 seconds / e.g. 10 minutes)', () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString(); // 600s
      const session = { last_reauth_at: tenMinutesAgo };

      const result = requireStepUpAuth(session, 300, now);
      expect(result.stepUpRequired).toBe(true);
      expect(result.secondsSinceReauth).toBe(600);
      expect(result.message).toContain('expired');
    });
  });

  describe('Step 058.3: POST /api/auth/step-up API Endpoint & Verification', () => {
    it('successfully verifies password, updates last_reauth_at on session, and issues ticket', async () => {
      const userRepo = new UserRepository();
      const mfaRepo = new UserMfaRepository();
      const sessionRepo = new SessionRepository();
      const auditRepo = new AuditLogRepository();

      const rawPassword = 'Password_Staff_1234!';
      const passwordHash = await hashPassword(rawPassword);

      const user = await userRepo.create({
        company_id: '018f6c4c-3500-7fa1-b1e2-000000000001',
        email: 'staff.officer@kdsolution.it',
        full_legal_name: 'Compliance Staff Officer',
        password_hash: passwordHash,
        password_changed_at: new Date().toISOString(),
        status: 'active',
        is_staff: true,
        failed_attempts: 0,
        locked_until: null,
      });

      const device: DeviceCharacteristics = { ip: '127.0.0.1', userAgent: 'Office Browser' };
      const session = createSession(user.id, device);

      const request = new Request('http://localhost:3000/api/auth/step-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-session-id': session.id,
        },
        body: JSON.stringify({
          password: rawPassword,
          action: 'UPDATE_GATEWAY_KEYS',
        }),
      });

      const res = await stepUpPostHandler(request, {
        userRepo,
        mfaRepo,
        sessionRepo,
        auditRepo,
      });

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.ticket_id).toBeDefined();
      expect(json.ticket_id).toMatch(/^ticket_/);
      expect(json.action).toBe('UPDATE_GATEWAY_KEYS');
      expect(json.last_reauth_at).toBeDefined();

      // Verify ticket is valid for consumption
      expect(verifyStepUpTicket(json.ticket_id, user.id, 'UPDATE_GATEWAY_KEYS')).toBe(true);

      // Verify audit log recorded STEP_UP_REAUTH_PASSED
      const audits = await auditRepo.findMany();
      const passLog = audits.find((a) => a.action === 'STEP_UP_REAUTH_PASSED');
      expect(passLog).toBeDefined();
      expect(passLog?.actor_id).toBe(user.id);
    });

    it('successfully verifies 2FA TOTP code for step-up verification', async () => {
      const userRepo = new UserRepository();
      const mfaRepo = new UserMfaRepository();
      const sessionRepo = new SessionRepository();
      const auditRepo = new AuditLogRepository();

      const user = await userRepo.create({
        company_id: '018f6c4c-3500-7fa1-b1e2-000000000001',
        email: 'merchant.totp@kdsolution.it',
        full_legal_name: 'TOTP Merchant',
        password_hash: await hashPassword('Password_1234_Totp!'),
        password_changed_at: new Date().toISOString(),
        status: 'active',
        is_staff: false,
        failed_attempts: 0,
        locked_until: null,
      });

      // Enroll TOTP
      const secret = generateTotpSecret();
      await mfaRepo.upsertEnrollment(user.id, secret);
      await mfaRepo.enableMfa(user.id);

      const validCode = generateTotp(secret);

      const request = new Request('http://localhost:3000/api/auth/step-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          totp_code: validCode,
          action: 'APPROVE_PAYOUT',
        }),
      });

      const res = await stepUpPostHandler(request, {
        userRepo,
        mfaRepo,
        sessionRepo,
        auditRepo,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.action).toBe('APPROVE_PAYOUT');
      expect(json.ticket_id).toBeDefined();
    });

    it('rejects step-up request when password or TOTP is invalid', async () => {
      const userRepo = new UserRepository();
      const user = await userRepo.create({
        company_id: '018f6c4c-3500-7fa1-b1e2-000000000001',
        email: 'invalid.stepup@kdsolution.it',
        full_legal_name: 'Invalid StepUp User',
        password_hash: await hashPassword('Real_Password_999!'),
        password_changed_at: new Date().toISOString(),
        status: 'active',
        is_staff: true,
        failed_attempts: 0,
        locked_until: null,
      });

      const request = new Request('http://localhost:3000/api/auth/step-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          password: 'WRONG_PASSWORD_ATTEMPT',
          action: 'UPDATE_GATEWAY_KEYS',
        }),
      });

      const res = await stepUpPostHandler(request, { userRepo });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.title).toBe('Verification Failed');
      expect(json.detail).toContain('Invalid password');
    });
  });

  describe('Step 058.4 & Quality Gate: Sensitive Gateway Management Gating', () => {
    it('Quality Gate: Attempting to reveal or edit gateway keys after 10 minutes of inactivity requires step-up challenge; completing reauth permits operation', async () => {
      const userRepo = new UserRepository();
      const mfaRepo = new UserMfaRepository();
      const sessionRepo = new SessionRepository();
      const auditRepo = new AuditLogRepository();

      const user = await userRepo.create({
        company_id: '018f6c4c-3500-7fa1-b1e2-000000000001',
        email: 'gateway.admin@kdsolution.it',
        full_legal_name: 'Gateway Admin',
        password_hash: await hashPassword('Admin_Gateway_Password_2026!'),
        password_changed_at: new Date().toISOString(),
        status: 'active',
        is_staff: true,
        failed_attempts: 0,
        locked_until: null,
      });

      const now = Date.now();
      // Simulate session after 10 minutes (600 seconds) of inactivity
      const staleReauthTimestamp = new Date(now - 10 * 60 * 1000).toISOString();
      const device: DeviceCharacteristics = { ip: '127.0.0.1', userAgent: 'Chrome Admin' };
      const session = createSession(user.id, device);
      session.last_reauth_at = staleReauthTimestamp;

      // 1. Guard check detects stale reauth (>300 seconds)
      const guardCheck = requireStepUpAuth(session, 300, now);
      expect(guardCheck.stepUpRequired).toBe(true);
      expect(guardCheck.secondsSinceReauth).toBe(600);

      // Attempting to invoke sensitive operation without ticket triggers challenge
      const protectedOpAttempt = await withStepUpGuard(
        {
          userId: user.id,
          action: 'UPDATE_GATEWAY_KEYS',
          ticketId: undefined,
        },
        async () => {
          return { nmiApiKeyUpdated: true, newKey: 'nmi_live_sec_9998182' };
        }
      );

      expect(protectedOpAttempt.success).toBe(false);
      if (!protectedOpAttempt.success) {
        expect(protectedOpAttempt.challengeRequired).toBe(true);
        expect(protectedOpAttempt.action).toBe('UPDATE_GATEWAY_KEYS');
      }

      // 2. User completes Step-Up Reauthentication via POST /api/auth/step-up
      const stepUpReq = new Request('http://localhost:3000/api/auth/step-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-session-id': session.id,
        },
        body: JSON.stringify({
          password: 'Admin_Gateway_Password_2026!',
          action: 'UPDATE_GATEWAY_KEYS',
        }),
      });

      const stepUpRes = await stepUpPostHandler(stepUpReq, {
        userRepo,
        mfaRepo,
        sessionRepo,
        auditRepo,
      });

      expect(stepUpRes.status).toBe(200);
      const stepUpData = await stepUpRes.json();
      expect(stepUpData.ticket_id).toBeDefined();

      // Session timestamp is now fresh
      const freshGuardCheck = requireStepUpAuth(session, 300, Date.now());
      expect(freshGuardCheck.stepUpRequired).toBe(false);

      // 3. User executes sensitive gateway operation with issued ticket
      const executionResult = await withStepUpGuard(
        {
          userId: user.id,
          action: 'UPDATE_GATEWAY_KEYS',
          ticketId: stepUpData.ticket_id,
        },
        async () => {
          return { nmiApiKeyUpdated: true, newKey: 'nmi_live_sec_9998182' };
        }
      );

      expect(executionResult.success).toBe(true);
      if (executionResult.success) {
        expect(executionResult.data.nmiApiKeyUpdated).toBe(true);
        expect(executionResult.data.newKey).toBe('nmi_live_sec_9998182');
      }
    });
  });
});
