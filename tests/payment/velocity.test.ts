// path: tests/payment/velocity.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkPaymentVelocity,
  isIpTemporarilyBlocked,
  unblockIp,
  resetVelocityStore,
  CardVelocityLimitExceededError,
} from '@/lib/payment/velocity';

describe('Card & IP Transaction Velocity Rate Limiting Engine (Step 136)', () => {
  const cardFingerprint = 'card_fingerprint_hash_visa_4242';
  const ipAddress = '198.51.100.44';

  beforeEach(() => {
    resetVelocityStore();
  });

  describe('Card Testing Attack Prevention (Step 136.2 & 136.4)', () => {
    it('allows 3 rapid test submissions and blocks the 4th with CardVelocityLimitExceededError', async () => {
      const now = new Date('2026-11-05T12:00:00Z');

      // Attempt 1: allowed
      const res1 = await checkPaymentVelocity(cardFingerprint, ipAddress, { now });
      expect(res1.allowed).toBe(true);
      expect(res1.cardHourlyCount).toBe(1);

      // Attempt 2: allowed
      const res2 = await checkPaymentVelocity(cardFingerprint, ipAddress, { now });
      expect(res2.allowed).toBe(true);
      expect(res2.cardHourlyCount).toBe(2);

      // Attempt 3: allowed
      const res3 = await checkPaymentVelocity(cardFingerprint, ipAddress, { now });
      expect(res3.allowed).toBe(true);
      expect(res3.cardHourlyCount).toBe(3);

      // Attempt 4: Must fail closed with CardVelocityLimitExceededError
      try {
        await checkPaymentVelocity(cardFingerprint, ipAddress, { now });
        expect.unreachable('Should have thrown CardVelocityLimitExceededError on 4th attempt');
      } catch (err) {
        expect(err).toBeInstanceOf(CardVelocityLimitExceededError);
        const velocityErr = err as CardVelocityLimitExceededError;
        expect(velocityErr.code).toBe('CARD_VELOCITY_LIMIT_EXCEEDED');
        expect(velocityErr.httpStatus).toBe(429);
        expect(velocityErr.message).toContain('maximum 3 payment attempts per hour reached');
      }

      // Verify IP address was also temporarily blocked (Step 136.3)
      expect(isIpTemporarilyBlocked(ipAddress, now)).toBe(true);
    });

    it('rejects subsequent attempts from the banned IP even with a different card', async () => {
      const now = new Date('2026-11-05T12:00:00Z');

      // Trigger card block
      for (let i = 0; i < 3; i++) {
        await checkPaymentVelocity(cardFingerprint, ipAddress, { now });
      }

      // Try 4th to trigger IP ban
      await expect(
        checkPaymentVelocity(cardFingerprint, ipAddress, { now })
      ).rejects.toThrow(CardVelocityLimitExceededError);

      // Try with a brand new card from the same banned IP
      await expect(
        checkPaymentVelocity('different_card_fingerprint_999', ipAddress, { now })
      ).rejects.toThrow(/temporarily blocked/);
    });
  });

  describe('Sliding Window Expiration', () => {
    it('allows new attempts after the 1-hour window elapses', async () => {
      const t0 = new Date('2026-11-05T12:00:00Z');

      // Use all 3 attempts
      await checkPaymentVelocity(cardFingerprint, ipAddress, { now: t0 });
      await checkPaymentVelocity(cardFingerprint, ipAddress, { now: t0 });
      await checkPaymentVelocity(cardFingerprint, ipAddress, { now: t0 });

      // Unblock IP for window test
      unblockIp(ipAddress);

      // 61 minutes later
      const t1 = new Date('2026-11-05T13:01:00Z');
      const result = await checkPaymentVelocity(cardFingerprint, ipAddress, { now: t1 });

      expect(result.allowed).toBe(true);
      expect(result.cardHourlyCount).toBe(1);
    });
  });

  describe('Daily Card Velocity Cap (Max 5 Per Day)', () => {
    it('blocks charges exceeding 5 per day even across multiple hours', async () => {
      const t1 = new Date('2026-11-05T01:00:00Z');
      await checkPaymentVelocity(cardFingerprint, '198.51.100.1', { now: t1 });
      await checkPaymentVelocity(cardFingerprint, '198.51.100.1', { now: t1 });

      const t2 = new Date('2026-11-05T03:00:00Z');
      await checkPaymentVelocity(cardFingerprint, '198.51.100.2', { now: t2 });
      await checkPaymentVelocity(cardFingerprint, '198.51.100.2', { now: t2 });

      const t3 = new Date('2026-11-05T05:00:00Z');
      await checkPaymentVelocity(cardFingerprint, '198.51.100.3', { now: t3 }); // 5th attempt

      // 6th attempt on the same day from another IP must be blocked
      const t4 = new Date('2026-11-05T07:00:00Z');
      await expect(
        checkPaymentVelocity(cardFingerprint, '198.51.100.4', { now: t4 })
      ).rejects.toThrow(/maximum 5 payment attempts per day reached/);
    });
  });

  describe('IP Hourly Velocity Cap (Max 10 Per Hour)', () => {
    it('blocks IP when more than 10 attempts are made within an hour', async () => {
      const now = new Date('2026-11-05T12:00:00Z');
      const testIp = '203.0.113.88';

      // Submit 10 distinct card attempts from same IP
      for (let i = 0; i < 10; i++) {
        const res = await checkPaymentVelocity(`card_${i}`, testIp, { now });
        expect(res.allowed).toBe(true);
      }

      // 11th attempt must exceed IP velocity
      await expect(
        checkPaymentVelocity('card_eleventh', testIp, { now })
      ).rejects.toThrow(/Payment velocity exceeded for IP/);
    });
  });
});
