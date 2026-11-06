// path: tests/payment/auth-capture.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  authorize,
  capture,
  voidAuthorization,
  expireStaleAuthorizations,
  getAuthorizationRecord,
  isPayoutEligible,
  resetAuthorizationStore,
  type AuthorizePaymentRequest,
} from '@/lib/payment/auth-capture';

describe('Two-Step Authorization & Capture Workflow Engine (Step 138)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';

  const defaultAuthRequest: AuthorizePaymentRequest = {
    tenantId,
    companyId,
    amount: Money.from('350.0000'),
    currency: 'USD',
    provider: 'stripe_connect',
    cardToken: 'tok_visa_card_auth_hold_1234',
    cardBrand: 'visa',
    description: 'Pre-order authorization hold',
  };

  beforeEach(() => {
    resetAuthorizationStore();
  });

  describe('Authorization Hold Creation (Step 138.1)', () => {
    it('places an authorization hold with status "authorized" without settling funds', async () => {
      const authRecord = await authorize(defaultAuthRequest);

      expect(authRecord.id).toBeDefined();
      expect(authRecord.status).toBe('authorized');
      expect(authRecord.amount.toNumericString()).toBe('350.0000');
      expect(authRecord.currency).toBe('USD');
      expect(authRecord.provider).toBe('stripe_connect');
      expect(authRecord.gatewayAuthId).toBeDefined();
      expect(authRecord.expiresAt).toBeDefined();

      // Verify expiration is set 7 days out
      const authTime = new Date(authRecord.authorizedAt).getTime();
      const expireTime = new Date(authRecord.expiresAt).getTime();
      const diffDays = Math.round((expireTime - authTime) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(7);
    });

    it('rejects authorization with non-USD or zero amount', async () => {
      await expect(
        authorize({ ...defaultAuthRequest, amount: Money.from('0.0000') })
      ).rejects.toThrow(/greater than zero/);

      await expect(
        authorize({ ...defaultAuthRequest, currency: 'EUR' as 'USD' })
      ).rejects.toThrow(/Platform strictly authorizes and settles in USD/);
    });
  });

  describe('Payout Invariant Guard (Step 138.3)', () => {
    it('strictly forbids payout eligibility while payment is in "authorized" state', async () => {
      const authRecord = await authorize(defaultAuthRequest);

      expect(authRecord.isPayoutEligible).toBe(false);
      expect(authRecord.isSettled).toBe(false);

      const eligible = await isPayoutEligible(authRecord.id);
      expect(eligible).toBe(false);
    });
  });

  describe('Capture Workflow (Step 138.2)', () => {
    it('captures full authorized amount, transitions status to "captured", and enables payout eligibility', async () => {
      const authRecord = await authorize(defaultAuthRequest);

      const captureResult = await capture({
        paymentId: authRecord.id,
      });

      expect(captureResult.status).toBe('captured');
      expect(captureResult.capturedAmount.toNumericString()).toBe('350.0000');
      expect(captureResult.isPayoutEligible).toBe(true);
      expect(captureResult.capturedAt).toBeDefined();

      // Check persisted record
      const updated = await getAuthorizationRecord(authRecord.id);
      expect(updated?.status).toBe('captured');
      expect(updated?.isSettled).toBe(true);
      expect(updated?.isPayoutEligible).toBe(true);

      const eligible = await isPayoutEligible(authRecord.id);
      expect(eligible).toBe(true);
    });

    it('supports partial capture of a lower amount', async () => {
      const authRecord = await authorize(defaultAuthRequest);

      const partialAmount = Money.from('200.0000');
      const captureResult = await capture({
        paymentId: authRecord.id,
        amount: partialAmount,
      });

      expect(captureResult.capturedAmount.toNumericString()).toBe('200.0000');
      expect(captureResult.status).toBe('captured');
    });

    it('rejects capture attempt that exceeds original authorized amount', async () => {
      const authRecord = await authorize(defaultAuthRequest);

      const excessAmount = Money.from('500.0000'); // Original was 350
      await expect(
        capture({
          paymentId: authRecord.id,
          amount: excessAmount,
        })
      ).rejects.toThrow(/cannot exceed original authorized amount/);
    });

    it('rejects duplicate capture attempts on already captured payments', async () => {
      const authRecord = await authorize(defaultAuthRequest);
      await capture({ paymentId: authRecord.id });

      await expect(
        capture({ paymentId: authRecord.id })
      ).rejects.toThrow(/Only 'authorized' payments can be captured/);
    });
  });

  describe('Voiding Active Authorizations', () => {
    it('voids active authorization hold and records reason', async () => {
      const authRecord = await authorize(defaultAuthRequest);

      const voidResult = await voidAuthorization({
        paymentId: authRecord.id,
        reason: 'Customer cancelled order prior to shipment',
      });

      expect(voidResult.status).toBe('voided');
      expect(voidResult.reason).toBe('Customer cancelled order prior to shipment');

      const updated = await getAuthorizationRecord(authRecord.id);
      expect(updated?.status).toBe('voided');
      expect(updated?.isPayoutEligible).toBe(false);
      expect(await isPayoutEligible(authRecord.id)).toBe(false);
    });
  });

  describe('7-Day Expiration & Auto-Voiding (Step 138.4)', () => {
    it('auto-expires authorizations held past 7 days without capture', async () => {
      // 1. Authorization placed 8 days ago
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const staleAuth = await authorize(defaultAuthRequest);

      // Manually set past timestamp on record
      const staleRecord = await getAuthorizationRecord(staleAuth.id);
      if (staleRecord) {
        staleRecord.expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Expired yesterday
      }

      // 2. Active authorization placed today
      const freshAuth = await authorize({
        ...defaultAuthRequest,
        amount: Money.from('120.0000'),
      });

      // 3. Run auto-expire job
      const summary = await expireStaleAuthorizations();

      expect(summary.totalInspected).toBe(2);
      expect(summary.expiredCount).toBe(1);
      expect(summary.expiredIds).toContain(staleAuth.id);
      expect(summary.expiredIds).not.toContain(freshAuth.id);

      // 4. Verify stale record is now expired
      const checkedStale = await getAuthorizationRecord(staleAuth.id);
      expect(checkedStale?.status).toBe('expired');
      expect(checkedStale?.isPayoutEligible).toBe(false);

      // 5. Attempting to capture expired auth must fail
      await expect(
        capture({ paymentId: staleAuth.id })
      ).rejects.toThrow(/Only 'authorized' payments can be captured/);
    });
  });
});
