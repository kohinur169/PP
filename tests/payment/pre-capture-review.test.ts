// path: tests/payment/pre-capture-review.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  isPreCaptureReviewRequired,
  initiatePreCaptureReview,
  getPreCaptureReview,
  approvePreCaptureReview,
  rejectPreCaptureReview,
  assertCaptureAllowed,
  assertSingleStepChargeAllowed,
  resetPreCaptureReviewStore,
  PreCaptureComplianceReviewRequiredError,
  SingleStepChargeOverThresholdForbiddenError,
  UnauthorizedReviewerRoleError,
} from '@/lib/payment/pre-capture-review';
import {
  authorize,
  capture,
  getAuthorizationRecord,
  resetAuthorizationStore,
  type AuthorizePaymentRequest,
} from '@/lib/payment/auth-capture';

describe('Mandatory USD $5,000+ Pre-Capture Compliance Review Gate (Step 139)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const reviewerId = '33333333-3333-4333-8333-333333333333';

  const baseAuthRequest: AuthorizePaymentRequest = {
    tenantId,
    companyId,
    amount: Money.from('7500.0000'), // $7,500.00 exceeds $5,000 threshold
    currency: 'USD',
    provider: 'nmi',
    cardToken: 'tok_nmi_vault_large_tx_9999',
    cardBrand: 'mastercard',
    description: 'B2B enterprise inventory wholesale order',
  };

  beforeEach(() => {
    resetAuthorizationStore();
    resetPreCaptureReviewStore();
  });

  describe('Threshold Evaluation (Step 139.1)', () => {
    it('does not flag transactions of $5,000.00 or below', () => {
      expect(isPreCaptureReviewRequired(Money.from('100.0000'))).toBe(false);
      expect(isPreCaptureReviewRequired(Money.from('4999.9900'))).toBe(false);
      expect(isPreCaptureReviewRequired(Money.from('5000.0000'))).toBe(false);
    });

    it('strictly flags any transaction over USD $5,000.0000', () => {
      expect(isPreCaptureReviewRequired(Money.from('5000.0100'))).toBe(true);
      expect(isPreCaptureReviewRequired(Money.from('7500.0000'))).toBe(true);
      expect(isPreCaptureReviewRequired(Money.from('50000.0000'))).toBe(true);
    });
  });

  describe('Automated Queue Enqueue & Capture Blocking (Step 139.2)', () => {
    it('automatically queues authorization over $5,000 for compliance review upon authorization', async () => {
      const auth = await authorize(baseAuthRequest);

      const review = await getPreCaptureReview(auth.id);
      expect(review).not.toBeNull();
      expect(review?.status).toBe('pending');
      expect(review?.amount.toNumericString()).toBe('7500.0000');
      expect(review?.provider).toBe('nmi');
    });

    it('strictly blocks capture attempt while compliance review is pending', async () => {
      const auth = await authorize(baseAuthRequest);

      await expect(capture({ paymentId: auth.id })).rejects.toThrow(
        PreCaptureComplianceReviewRequiredError
      );

      await expect(capture({ paymentId: auth.id })).rejects.toThrow(
        /Transaction over USD 5,000.*pending compliance review approval/
      );

      // Verify payment remains uncaptured and not payout eligible
      const record = await getAuthorizationRecord(auth.id);
      expect(record?.status).toBe('authorized');
      expect(record?.isPayoutEligible).toBe(false);
      expect(record?.isSettled).toBe(false);
    });

    it('allows normal capture for transactions under or equal to $5,000 without review', async () => {
      const smallAuth = await authorize({
        ...baseAuthRequest,
        amount: Money.from('2400.0000'),
      });

      const captureResult = await capture({ paymentId: smallAuth.id });
      expect(captureResult.status).toBe('captured');
      expect(captureResult.isPayoutEligible).toBe(true);
    });
  });

  describe('Reviewer RBAC & Documented Approval (Step 139.3)', () => {
    it('rejects approval attempt from unauthorized roles such as support or merchant_admin', async () => {
      const auth = await authorize(baseAuthRequest);

      await expect(
        approvePreCaptureReview({
          paymentId: auth.id,
          reviewerId,
          reviewerRole: 'support',
          justification: 'Looks fine to me from tier support standpoint',
        })
      ).rejects.toThrow(UnauthorizedReviewerRoleError);

      await expect(
        approvePreCaptureReview({
          paymentId: auth.id,
          reviewerId,
          reviewerRole: 'merchant_admin',
          justification: 'Merchant approves their own payment',
        })
      ).rejects.toThrow(UnauthorizedReviewerRoleError);
    });

    it('requires mandatory documented justification with minimum 10 characters', async () => {
      const auth = await authorize(baseAuthRequest);

      await expect(
        approvePreCaptureReview({
          paymentId: auth.id,
          reviewerId,
          reviewerRole: 'compliance_kyc',
          justification: 'OK', // Too short
        })
      ).rejects.toThrow(/Documented compliance justification is mandatory/);
    });

    it('approves review when authorized compliance_kyc, ceo, or super_admin provides valid justification and unlocks capture', async () => {
      const auth = await authorize(baseAuthRequest);

      const review = await approvePreCaptureReview({
        paymentId: auth.id,
        reviewerId,
        reviewerRole: 'compliance_kyc',
        justification: 'Verified signed purchase order, corporate EIN, and commercial delivery agreement.',
        ipAddress: '198.51.100.12',
      });

      expect(review.status).toBe('approved');
      expect(review.reviewerRole).toBe('compliance_kyc');
      expect(review.reviewedAt).toBeDefined();

      // Verify capture is now permitted
      await expect(assertCaptureAllowed(auth.id, auth.amount)).resolves.not.toThrow();

      const captureResult = await capture({ paymentId: auth.id });
      expect(captureResult.status).toBe('captured');
      expect(captureResult.isPayoutEligible).toBe(true);
    });
  });

  describe('Rejection & Automatic Authorization Voiding (Step 139.4)', () => {
    it('rejection auto-voids authorization hold and permanently blocks capture', async () => {
      const auth = await authorize(baseAuthRequest);

      const review = await rejectPreCaptureReview({
        paymentId: auth.id,
        reviewerId,
        reviewerRole: 'super_admin',
        rejectionReason: 'Invoiced buyer corporate entity failed OFAC match and UBO verification.',
      });

      expect(review.status).toBe('rejected');
      expect(review.rejectionReason).toContain('Invoiced buyer corporate entity failed');

      // Authorization must be auto-voided
      const authRecord = await getAuthorizationRecord(auth.id);
      expect(authRecord?.status).toBe('voided');
      expect(authRecord?.voidReason).toContain('Pre-capture compliance review rejected');
      expect(authRecord?.isPayoutEligible).toBe(false);

      // Attempting to capture must be blocked
      await expect(capture({ paymentId: auth.id })).rejects.toThrow(
        /Only 'authorized' payments can be captured/
      );
    });
  });

  describe('Single-Step Charge Provider Gate (Step 139.5)', () => {
    it('rejects single-step charge over $5,000 if provider cannot separate auth from capture and transaction is not pre-approved', () => {
      const largeAmount = Money.from('6200.0000');

      expect(() => {
        assertSingleStepChargeAllowed(largeAmount, false, false);
      }).toThrow(SingleStepChargeOverThresholdForbiddenError);

      expect(() => {
        assertSingleStepChargeAllowed(largeAmount, false, false);
      }).toThrow(/Never charge first and review afterward/);
    });

    it('permits single-step charge if amount <= $5,000 or if pre-approved or provider separates auth/capture', () => {
      const smallAmount = Money.from('4500.0000');
      const largeAmount = Money.from('8000.0000');

      // Small amount passes
      expect(() => {
        assertSingleStepChargeAllowed(smallAmount, false, false);
      }).not.toThrow();

      // Provider separates auth and capture passes
      expect(() => {
        assertSingleStepChargeAllowed(largeAmount, true, false);
      }).not.toThrow();

      // Pre-approved passes
      expect(() => {
        assertSingleStepChargeAllowed(largeAmount, false, true);
      }).not.toThrow();
    });
  });
});
