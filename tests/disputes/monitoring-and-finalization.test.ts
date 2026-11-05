// path: tests/disputes/monitoring-and-finalization.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  reviewAndSubmitDisputeEvidence,
  getDisputeComplianceReview,
  resetDisputeComplianceReviews,
} from '@/lib/disputes/submit';
import {
  configurePlatformChargebackFee,
  getPlatformChargebackFee,
  postChargebackFeeDeduction,
  resetPlatformChargebackFee,
} from '@/lib/disputes/chargeback-fee';
import {
  evaluateMerchantChargebackMonitoring,
  configureSchemeThresholds,
  resetSchemeThresholds,
} from '@/lib/disputes/monitoring-program';
import {
  finalizeDisputeOutcome,
} from '@/lib/disputes/outcome';
import {
  ingestGatewayDisputeWebhook,
  resetIngestedDisputesStore,
} from '@/lib/disputes/ingest';

describe('Phase 14: Compliance Review, Chargeback Fee & Outcome Settlement (Steps 207-210)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';
  const paymentId = 'pay_test_phase14_001';

  beforeEach(() => {
    resetIngestedDisputesStore();
    resetDisputeComplianceReviews();
    resetPlatformChargebackFee();
    resetSchemeThresholds();
  });

  describe('Step 207: Compliance Four-Eye Review & Provider Submission Engine', () => {
    it('blocks non-compliance users from approving dispute evidence submission', async () => {
      const dispute = await ingestGatewayDisputeWebhook({
        tenantId,
        companyId,
        paymentId,
        gateway: 'stripe',
        gatewayDisputeId: 'dp_rev_001',
        amountUsd: '300.0000',
        rawReasonCode: '10.4',
      });

      await expect(
        reviewAndSubmitDisputeEvidence({
          disputeId: dispute.id,
          reviewerId: 'usr_submerchant_01',
          reviewerRole: 'merchant_admin', // Not allowed
          decision: 'approved_for_gateway',
        })
      ).rejects.toThrow(/Unauthorized: Only Compliance Officers/);
    });

    it('allows compliance officer to approve evidence and records gateway submission ID', async () => {
      const dispute = await ingestGatewayDisputeWebhook({
        tenantId,
        companyId,
        paymentId,
        gateway: 'nmi',
        gatewayDisputeId: 'dp_nmi_123',
        amountUsd: '250.0000',
        rawReasonCode: '13.1',
      });

      const review = await reviewAndSubmitDisputeEvidence({
        disputeId: dispute.id,
        reviewerId: 'usr_comp_officer_01',
        reviewerRole: 'compliance_officer',
        decision: 'approved_for_gateway',
        internalNotes: 'Proof of delivery tracking matches cardholder billing address perfectly.',
      });

      expect(review.decision).toBe('approved_for_gateway');
      expect(review.gatewaySubmissionId).toMatch(/^sub_nmi_/);
      expect(dispute.status).toBe('evidence_submitted');

      const savedReview = getDisputeComplianceReview(dispute.id);
      expect(savedReview?.reviewerId).toBe('usr_comp_officer_01');
    });
  });

  describe('Step 208: Chargeback Fee Deduction & Balance Offset Engine', () => {
    it('debits configured chargeback fee ($15 default) from merchant available balance', async () => {
      const result = await postChargebackFeeDeduction({
        disputeId: 'disp_fee_test_01',
        companyId,
        tenantId,
        hasSufficientAvailableBalance: true,
      });

      expect(result.feeAmountUsd).toBe('15.0000');
      expect(result.sourceAccountDebited).toBe('2100'); // Available liabilities
      expect(result.revenueAccountCredited).toBe('4000');
      expect(result.journalEntryId).toBeDefined();
    });

    it('offsets chargeback fee against rolling reserve when available balance is deficient', async () => {
      configurePlatformChargebackFee('25.0000');
      expect(getPlatformChargebackFee()).toBe('25.0000');

      const result = await postChargebackFeeDeduction({
        disputeId: 'disp_fee_test_02',
        companyId,
        tenantId,
        hasSufficientAvailableBalance: false,
      });

      expect(result.feeAmountUsd).toBe('25.0000');
      expect(result.sourceAccountDebited).toBe('2110'); // Reserve liabilities
    });
  });

  describe('Step 209: Graduated Card Scheme Chargeback Monitoring & Penalty Framework', () => {
    it('triggers Level 1 warning at 0.35% dispute ratio', async () => {
      // 1000 orders, 4 disputes = 0.4%
      const metrics = await evaluateMerchantChargebackMonitoring({
        companyId,
        rolling90DayVolumeCount: 1000,
        rolling90DayDisputeCount: 4,
      });

      expect(metrics.chargebackRatio).toBeCloseTo(0.004, 4);
      expect(metrics.currentInterventionLevel).toBe('LEVEL_1_WARNING');
      expect(metrics.additionalReservePercent).toBe(0);
      expect(metrics.isProcessingSuspended).toBe(false);
      expect(metrics.remediationChecklistEnqueued).toBe(true);
    });

    it('triggers Level 2 reserve escalation (+5%) at 0.65% dispute ratio', async () => {
      // 1000 orders, 7 disputes = 0.7%
      const metrics = await evaluateMerchantChargebackMonitoring({
        companyId,
        rolling90DayVolumeCount: 1000,
        rolling90DayDisputeCount: 7,
      });

      expect(metrics.currentInterventionLevel).toBe('LEVEL_2_RESERVE_ESCALATION');
      expect(metrics.additionalReservePercent).toBe(5);
      expect(metrics.isProcessingSuspended).toBe(false);
    });

    it('triggers Level 3 immediate processing suspension at 0.95% dispute ratio', async () => {
      // 1000 orders, 10 disputes = 1.0%
      const metrics = await evaluateMerchantChargebackMonitoring({
        companyId,
        rolling90DayVolumeCount: 1000,
        rolling90DayDisputeCount: 10,
      });

      expect(metrics.currentInterventionLevel).toBe('LEVEL_3_SUSPENSION');
      expect(metrics.isProcessingSuspended).toBe(true);
    });
  });

  describe('Step 210: Dispute Outcome Settlement & Ledger Reversal Finalizer', () => {
    it('finalizes WON dispute by releasing held funds back to merchant available balance', async () => {
      const dispute = await ingestGatewayDisputeWebhook({
        tenantId,
        companyId,
        paymentId,
        gateway: 'airwallex',
        gatewayDisputeId: 'dp_aw_777',
        amountUsd: '400.0000',
        rawReasonCode: '10.4',
      });

      expect(dispute.isAmountFrozen).toBe(true);

      const settlement = await finalizeDisputeOutcome({
        disputeId: dispute.id,
        outcome: 'won',
        cardNetworkReportSummary: 'Issuer accepted evidence pack. Dispute closed in merchant favor.',
      });

      expect(settlement.outcome).toBe('won');
      expect(dispute.status).toBe('won');
      expect(dispute.isAmountFrozen).toBe(false);
      expect(settlement.heldAmountReleasedOrFinalized).toBe(true);
      expect(settlement.notifiedMerchant).toBe(true);
    });

    it('finalizes LOST dispute by posting chargeback loss against held funds', async () => {
      const dispute = await ingestGatewayDisputeWebhook({
        tenantId,
        companyId,
        paymentId,
        gateway: 'rainforest',
        gatewayDisputeId: 'dp_rf_888',
        amountUsd: '180.0000',
        rawReasonCode: '13.1',
      });

      const settlement = await finalizeDisputeOutcome({
        disputeId: dispute.id,
        outcome: 'lost',
        cardNetworkReportSummary: 'Issuer determined evidence insufficient.',
      });

      expect(settlement.outcome).toBe('lost');
      expect(dispute.status).toBe('lost');
      expect(dispute.isAmountFrozen).toBe(false);
      expect(settlement.heldAmountReleasedOrFinalized).toBe(true);
    });
  });
});
