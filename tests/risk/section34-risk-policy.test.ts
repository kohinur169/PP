// path: tests/risk/section34-risk-policy.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  proposeRiskPolicyUpdate,
  approveRiskPolicyProposal,
  evaluateMerchantRiskTierEligibility,
  evaluatePreCaptureReviewGate,
  evaluateSection34PayoutEligibility,
  approvePayoutException,
  resetSection34RiskPolicyStore,
  SECTION_34_TIER_RULES,
} from '@/lib/risk/section34-risk-policy';

describe('Merchant Risk Tiers, Policy Dual-Approval & Fulfilment Gates (Section 34 - Step 187)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';
  const ceoId = '33333333-4444-5555-8666-777777777777';
  const superAdminId = '44444444-5555-6666-8777-888888888888';

  beforeEach(() => {
    resetSection34RiskPolicyStore();
  });

  describe('Risk Policy Proposals & Four-Eye Dual Control', () => {
    it('proposes policy update and allows distinct executive to approve', async () => {
      const proposal = await proposeRiskPolicyUpdate({
        tenantId,
        proposerId: ceoId,
        proposerRole: 'ceo',
        policyType: 'rolling_reserve_adjustment',
        parameters: { tier: 1, rollingReservePct: 12 },
        effectiveDate: '2026-12-01T00:00:00Z',
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.status).toBe('proposed');

      const approved = await approveRiskPolicyProposal({
        tenantId,
        proposalId: proposal.id,
        approverId: superAdminId,
        approverRole: 'super_admin',
      });

      expect(approved.status).toBe('approved');
      expect(approved.approverId).toBe(superAdminId);
    });

    it('rejects approval if approver is the same actor as proposer (Four-Eye check)', async () => {
      const proposal = await proposeRiskPolicyUpdate({
        tenantId,
        proposerId: ceoId,
        proposerRole: 'ceo',
        policyType: 'chargeback_threshold',
        parameters: { maxChargebackPct: 0.25 },
        effectiveDate: '2026-12-01T00:00:00Z',
      });

      await expect(
        approveRiskPolicyProposal({
          tenantId,
          proposalId: proposal.id,
          approverId: ceoId, // Same actor!
          approverRole: 'ceo',
        })
      ).rejects.toThrow('Four-Eye violation: Risk policy approver must be distinct from proposer.');
    });

    it('denies support or unauthorized role from proposing policy updates', async () => {
      await expect(
        proposeRiskPolicyUpdate({
          tenantId,
          proposerId: '55555555-6666-7777-8888-999999999999',
          proposerRole: 'support',
          policyType: 'volume_cap',
          parameters: { cap: 100000 },
          effectiveDate: '2026-12-01T00:00:00Z',
        })
      ).rejects.toThrow(/Unauthorized/);
    });
  });

  describe('Section 34 Risk Tier Evaluation', () => {
    it('assigns new merchant to Tier 1 by default', () => {
      const result = evaluateMerchantRiskTierEligibility({
        companyId,
        activeDays: 15,
        completedOrdersCount: 5,
        chargebackRatePct: 0.0,
        hasFraudFlags: false,
        hasCurrentReKyc: false,
      });

      expect(result.eligibleTier).toBe(1);
      expect(result.rules.singleTransactionCapUsd).toBe(500);
      expect(result.rules.monthlyVolumeCapUsd).toBe(2500);
      expect(result.rules.rollingReservePct).toBe(10);
      expect(result.rules.postFulfilmentDelayDays).toBe(7);
    });

    it('evaluates Tier 2 eligibility (60 active days, 20 orders, chargeback < 0.3%, 0 fraud)', () => {
      const result = evaluateMerchantRiskTierEligibility({
        companyId,
        activeDays: 65,
        completedOrdersCount: 22,
        chargebackRatePct: 0.15,
        hasFraudFlags: false,
        hasCurrentReKyc: false,
      });

      expect(result.eligibleTier).toBe(2);
      expect(result.rules.singleTransactionCapUsd).toBe(2500);
      expect(result.rules.monthlyVolumeCapUsd).toBe(15000);
      expect(result.rules.rollingReservePct).toBe(5);
      expect(result.rules.postFulfilmentDelayDays).toBe(3);
    });

    it('evaluates Tier 3 eligibility (180 active days, 100 orders, chargeback < 0.3%, valid re-KYC)', () => {
      const result = evaluateMerchantRiskTierEligibility({
        companyId,
        activeDays: 200,
        completedOrdersCount: 150,
        chargebackRatePct: 0.2,
        hasFraudFlags: false,
        hasCurrentReKyc: true,
      });

      expect(result.eligibleTier).toBe(3);
      expect(result.rules.singleTransactionCapUsd).toBe(10000);
      expect(result.rules.monthlyVolumeCapUsd).toBe(50000);
      expect(result.rules.postFulfilmentDelayDays).toBe(2);
    });
  });

  describe('Pre-Capture Review Gate (> $5,000 threshold)', () => {
    it('permits capture for transactions <= $5,000', () => {
      const gate = evaluatePreCaptureReviewGate({
        companyId,
        amountUsd: 4999.99,
        riskTier: 3,
      });

      expect(gate.requiresManualReview).toBe(false);
      expect(gate.isCaptureBlocked).toBe(false);
      expect(gate.status).toBe('cleared_for_capture');
    });

    it('blocks capture and flags manual review for transactions > $5,000 at any tier', () => {
      const gate = evaluatePreCaptureReviewGate({
        companyId,
        amountUsd: 5000.01,
        riskTier: 3,
      });

      expect(gate.requiresManualReview).toBe(true);
      expect(gate.isCaptureBlocked).toBe(true);
      expect(gate.status).toBe('blocked_pending_manual_review');
      expect(gate.reason).toContain('exceeds USD 5,000 threshold');
    });
  });

  describe('Section 34 Payout Eligibility & Fulfilment Gates', () => {
    it('blocks payout if post-fulfilment delay is not met', () => {
      const eligibility = evaluateSection34PayoutEligibility({
        companyId,
        riskTier: 1, // Requires 7 days
        daysSinceFulfilment: 5,
        hasDeliveryProof: true,
        isProviderVerified: true,
        isBankAccountVerified: true,
        availableBalanceUsd: 500.0,
        hasDisputeOrHold: false,
      });

      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.blockReasons[0]).toContain('requires at least 7 days');
    });

    it('blocks payout if delivery proof is missing unless executive exception is granted', async () => {
      const blocked = evaluateSection34PayoutEligibility({
        companyId,
        riskTier: 1,
        daysSinceFulfilment: 8,
        hasDeliveryProof: false, // missing!
        isProviderVerified: true,
        isBankAccountVerified: true,
        availableBalanceUsd: 1000.0,
        hasDisputeOrHold: false,
      });

      expect(blocked.isEligible).toBe(false);
      expect(blocked.blockReasons[0]).toContain('Missing verified delivery proof');

      // Grant exception by CEO
      await approvePayoutException({
        tenantId,
        companyId,
        evidence: 'Digital service signed acceptance confirmation document on file',
        complianceReason: 'Consulting retainer service delivered without physical shipment',
        approverId: ceoId,
        approverRole: 'ceo',
      });

      const cleared = evaluateSection34PayoutEligibility({
        companyId,
        riskTier: 1,
        daysSinceFulfilment: 8,
        hasDeliveryProof: false,
        isProviderVerified: true,
        isBankAccountVerified: true,
        availableBalanceUsd: 1000.0,
        hasDisputeOrHold: false,
      });

      expect(cleared.isEligible).toBe(true);
      expect(cleared.blockReasons).toHaveLength(0);
    });
  });
});
