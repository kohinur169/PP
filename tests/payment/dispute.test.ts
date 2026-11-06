// path: tests/payment/dispute.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  authorize,
  capture,
  resetAuthorizationStore,
  type AuthorizePaymentRequest,
} from '@/lib/payment/auth-capture';
import {
  createDispute,
  extendDisputeDeadline,
  checkAndSendDisputeWarnings,
  getDispute,
  listDisputesForCompany,
  resetDisputeStore,
} from '@/lib/payment/dispute';

describe('Chargeback Dispute Intake & Timezone-Aware Deadline Engine (Step 143)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const superAdminId = '99999999-9999-4999-8999-999999999999';

  const baseAuthRequest: AuthorizePaymentRequest = {
    tenantId,
    companyId,
    amount: Money.from('450.0000'),
    currency: 'USD',
    provider: 'stripe_connect',
    cardToken: 'tok_visa_dispute_test_1111',
    cardBrand: 'visa',
    description: 'Hardware retail purchase',
  };

  beforeEach(() => {
    resetAuthorizationStore();
    resetDisputeStore();
  });

  describe('Dispute Intake & Initial Start Warning (Step 143.1)', () => {
    it('creates dispute record with 24-hour deadline in merchant timezone and sends initial warning at start', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('450.0000'),
        reason: 'product_not_received',
        merchantTimezone: 'Asia/Dhaka',
      });

      expect(dispute.id).toBeDefined();
      expect(dispute.status).toBe('needs_response');
      expect(dispute.merchantTimezone).toBe('Asia/Dhaka');
      expect(dispute.deadlineHours).toBe(24);
      expect(dispute.warningStartSentAt).toBeDefined(); // Warning 1 sent at start
      expect(dispute.warningMiddleSentAt).toBeUndefined();

      // Verify deadline is set 24 hours out
      const createdTime = new Date(dispute.createdAt).getTime();
      const deadlineTime = new Date(dispute.deadlineAt).getTime();
      const diffHours = Math.round((deadlineTime - createdTime) / (60 * 60 * 1000));
      expect(diffHours).toBe(24);
    });
  });

  describe('Mid-Window Warning Scheduler (Step 143.2)', () => {
    it('sends middle-window warning at 50% mark and does not re-send prematurely or repeatedly', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('450.0000'),
        reason: 'fraudulent',
        merchantTimezone: 'America/New_York',
      });

      const startTime = new Date(dispute.createdAt).getTime();

      // 1. Advance time 6 hours (25% mark) -> no middle warning
      const time6h = new Date(startTime + 6 * 60 * 60 * 1000);
      const summary6h = await checkAndSendDisputeWarnings(time6h);
      expect(summary6h.middleWarningsSent).toBe(0);

      const check1 = await getDispute(dispute.id);
      expect(check1?.warningMiddleSentAt).toBeUndefined();

      // 2. Advance time to 12 hours (50% mark) -> middle warning triggered
      const time12h = new Date(startTime + 12 * 60 * 60 * 1000);
      const summary12h = await checkAndSendDisputeWarnings(time12h);
      expect(summary12h.middleWarningsSent).toBe(1);

      const check2 = await getDispute(dispute.id);
      expect(check2?.warningMiddleSentAt).toBeDefined();

      // 3. Advance time to 15 hours -> middle warning already sent, no duplicate
      const time15h = new Date(startTime + 15 * 60 * 60 * 1000);
      const summary15h = await checkAndSendDisputeWarnings(time15h);
      expect(summary15h.middleWarningsSent).toBe(0);
    });
  });

  describe('Super Admin Deadline Extension (Step 143.3)', () => {
    it('rejects extension attempt from non-super_admin role', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('450.0000'),
        reason: 'general',
      });

      await expect(
        extendDisputeDeadline({
          disputeId: dispute.id,
          hours: 48,
          requesterId: 'staff-merchant-1',
          requesterRole: 'merchant_admin',
        })
      ).rejects.toThrow(/Only super_admin can extend dispute deadlines to 48 hours/);
    });

    it('allows super_admin to extend deadline from 24 hours to 48 hours', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('450.0000'),
        reason: 'duplicate',
      });

      const extended = await extendDisputeDeadline({
        disputeId: dispute.id,
        hours: 48,
        requesterId: superAdminId,
        requesterRole: 'super_admin',
      });

      expect(extended.deadlineHours).toBe(48);

      const createdTime = new Date(extended.createdAt).getTime();
      const deadlineTime = new Date(extended.deadlineAt).getTime();
      const diffHours = Math.round((deadlineTime - createdTime) / (60 * 60 * 1000));
      expect(diffHours).toBe(48);
    });
  });

  describe('Deadline Expiration Engine (Step 143.4)', () => {
    it('marks dispute as expired when deadline elapses without response', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const dispute = await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('450.0000'),
        reason: 'subscription_canceled',
      });

      const startTime = new Date(dispute.createdAt).getTime();

      // Advance time 25 hours (past 24h deadline)
      const time25h = new Date(startTime + 25 * 60 * 60 * 1000);
      const summary = await checkAndSendDisputeWarnings(time25h);

      expect(summary.expiredDisputes).toBe(1);

      const expired = await getDispute(dispute.id);
      expect(expired?.status).toBe('expired');
      expect(expired?.closedAt).toBeDefined();
    });

    it('lists disputes by company ID', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      await createDispute({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('450.0000'),
        reason: 'credit_not_processed',
      });

      const list = await listDisputesForCompany(companyId);
      expect(list.length).toBe(1);
      expect(list[0]?.companyId).toBe(companyId);
    });
  });
});
