// path: tests/auth/step-up.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  issueStepUpTicket,
  verifyStepUpTicket,
  consumeStepUpTicket,
  withStepUpGuard,
  clearStepUpRegistry,
  createStepUpChallenge,
  REAUTH_GRACE_PERIOD_MS,
} from '@/lib/auth';

describe('Step-Up Reauthentication & Sensitive Action Gating (Step 014)', () => {
  const userId = 'user_stepup_01';

  beforeEach(() => {
    clearStepUpRegistry();
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
});
