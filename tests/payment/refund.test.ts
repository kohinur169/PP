// path: tests/payment/refund.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  authorize,
  capture,
  resetAuthorizationStore,
  type AuthorizePaymentRequest,
} from '@/lib/payment/auth-capture';
import {
  requestRefund,
  approveRefund,
  rejectRefund,
  processRefund,
  getRefund,
  listRefundsForPayment,
  resetRefundStore,
} from '@/lib/payment/refund';
import {
  updateChargebackThresholdPolicy,
  resetChargebackPolicyStore,
} from '@/lib/payment/chargeback-policy';

describe('Sub-Merchant Refund Management Engine & Dual-Control Workflow (Step 142)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const userStaffA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userStaffB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const superAdminId = '99999999-9999-4999-8999-999999999999';

  const baseAuthRequest: AuthorizePaymentRequest = {
    tenantId,
    companyId,
    amount: Money.from('800.0000'),
    currency: 'USD',
    provider: 'stripe_connect',
    cardToken: 'tok_visa_refund_test_4242',
    cardBrand: 'visa',
    description: 'E-commerce retail order for clothing and accessories',
  };

  beforeEach(() => {
    resetAuthorizationStore();
    resetRefundStore();
    resetChargebackPolicyStore();
  });

  describe('Pre-Refund Validation & Lifecycle Guards (Step 142.1)', () => {
    it('strictly forbids refunding an uncaptured authorization', async () => {
      const auth = await authorize(baseAuthRequest);

      await expect(
        requestRefund({
          tenantId,
          companyId,
          paymentId: auth.id,
          amount: Money.from('100.0000'),
          reason: 'Customer return',
          requestedBy: userStaffA,
          requesterRole: 'merchant_admin',
        })
      ).rejects.toThrow(/Only captured payments can be refunded/);
    });

    it('rejects refund request with zero or negative amount', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      await expect(
        requestRefund({
          tenantId,
          companyId,
          paymentId: auth.id,
          amount: Money.from('0.0000'),
          reason: 'Zero amount test',
          requestedBy: userStaffA,
          requesterRole: 'merchant_admin',
        })
      ).rejects.toThrow(/strictly greater than zero/);
    });
  });

  describe('Standard Refund Processing (<= $500 Threshold) (Step 142.2)', () => {
    it('auto-approves refunds under or equal to $500 threshold and processes them to succeeded', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const refund = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('250.0000'), // <= $500 threshold
        reason: 'Customer returned 1 item in original packaging',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });

      expect(refund.status).toBe('approved');
      expect(refund.amount.toNumericString()).toBe('250.0000');
      expect(refund.approvedBy).toBe(userStaffA);

      // Process refund
      const processed = await processRefund(refund.id);
      expect(processed.status).toBe('succeeded');
      expect(processed.gatewayRefundId).toMatch(/^re_/);

      const fetched = await getRefund(refund.id);
      expect(fetched?.status).toBe('succeeded');
    });
  });

  describe('Dual-Control High-Value Refund Workflow (> $500 Threshold) (Step 142.3)', () => {
    it('queues refund over $500 as pending_approval and blocks processing until approved', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const refund = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('750.0000'), // > $500 threshold
        reason: 'Full order cancellation and merchandise return',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });

      expect(refund.status).toBe('pending_approval');
      expect(refund.approvedBy).toBeUndefined();

      // Attempting to process before approval must fail
      await expect(processRefund(refund.id)).rejects.toThrow(
        /Refund must be 'approved' before processing/
      );
    });

    it('enforces four-eye dual-control: requester cannot approve their own high-value refund', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const refund = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('600.0000'),
        reason: 'Order damaged in transit',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });

      await expect(
        approveRefund({
          refundId: refund.id,
          approverId: userStaffA, // Same as requester
          approverRole: 'merchant_admin',
        })
      ).rejects.toThrow(/Dual-control violation: Approver must be distinct/);
    });

    it('allows distinct authorized user to approve high-value refund and process it', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const refund = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('600.0000'),
        reason: 'Order damaged in transit',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });

      const approved = await approveRefund({
        refundId: refund.id,
        approverId: userStaffB, // Distinct approver
        approverRole: 'compliance_kyc',
      });

      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe(userStaffB);

      const processed = await processRefund(refund.id);
      expect(processed.status).toBe('succeeded');
    });

    it('allows rejection of pending refund request with recorded reason', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const refund = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('700.0000'),
        reason: 'Suspected customer charge dispute',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });

      const rejected = await rejectRefund({
        refundId: refund.id,
        rejectorId: userStaffB,
        rejectorRole: 'merchant_admin',
        rejectionReason: 'Items were verified delivered and signed; customer retains goods.',
      });

      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toContain('Items were verified delivered');
    });
  });

  describe('Over-Refund Balance Protection (Step 142.4)', () => {
    it('prevents multiple partial refunds from exceeding original captured amount', async () => {
      const auth = await authorize(baseAuthRequest); // $800.00
      await capture({ paymentId: auth.id });

      // First refund: $500.00
      const ref1 = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('500.0000'),
        reason: 'Partial return part 1',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });
      await processRefund(ref1.id);

      // Second refund: $300.00 (Total = $800.00)
      const ref2 = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('300.0000'),
        reason: 'Partial return part 2',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });
      await processRefund(ref2.id);

      // Third refund: $50.00 (Exceeds remaining $0.00)
      await expect(
        requestRefund({
          tenantId,
          companyId,
          paymentId: auth.id,
          amount: Money.from('50.0000'),
          reason: 'Excess refund attempt',
          requestedBy: userStaffA,
          requesterRole: 'merchant_admin',
        })
      ).rejects.toThrow(/exceeds remaining refundable amount/);

      const allRefunds = await listRefundsForPayment(auth.id);
      expect(allRefunds.length).toBe(2);
    });
  });

  describe('Platform Fee Policy Treatment (Step 142.5)', () => {
    it('retains platform fee on refund when returnPlatformFeeOnRefund is false', async () => {
      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const refund = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('200.0000'),
        reason: 'Customer changed mind',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });

      expect(refund.isPlatformFeeRefunded).toBe(false);
      expect(refund.platformFeeRefundedAmount.toNumericString()).toBe('0.0000');
    });

    it('returns platform fee when super_admin sets returnPlatformFeeOnRefund to true', async () => {
      await updateChargebackThresholdPolicy({
        tenantId,
        updaterId: superAdminId,
        updaterRole: 'super_admin',
        returnPlatformFeeOnRefund: true,
      });

      const auth = await authorize(baseAuthRequest);
      await capture({ paymentId: auth.id });

      const refund = await requestRefund({
        tenantId,
        companyId,
        paymentId: auth.id,
        amount: Money.from('200.0000'),
        reason: 'Customer changed mind',
        requestedBy: userStaffA,
        requesterRole: 'merchant_admin',
      });

      expect(refund.isPlatformFeeRefunded).toBe(true);
      expect(refund.platformFeeRefundedAmount.toNumericString()).toBe('5.8000'); // 200 * 0.029 = 5.8000
    });
  });
});
