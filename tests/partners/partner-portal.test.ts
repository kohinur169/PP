// path: tests/partners/partner-portal.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPartner,
  submitAndVerifyPartnerTaxForm,
  resetPartnerEngineStore,
} from '@/lib/partners/partner-engine';
import {
  createCommissionAgreement,
  calculateMonthlyPartnerCommission,
  resetCommissionEngineStore,
} from '@/lib/partners/commission-engine';
import {
  getPartnerPortalDashboard,
  includePartnerCommissionInPayoutBatch,
  resetPartnerPayoutsStore,
} from '@/lib/partners/partner-portal';

describe('Partner Portal Data Aggregation & Payout Batch Inclusion (Step 183)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const reviewerUser = '88888888-8888-4888-8888-888888888888';
  const mockPayoutBatchId = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    resetPartnerEngineStore();
    resetCommissionEngineStore();
    resetPartnerPayoutsStore();
  });

  describe('Portal Dashboard Aggregation', () => {
    it('aggregates profile, referred merchants list, earnings, and tax hold escrow', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Enterprise Payment Partners',
        partnerType: 'iso',
        customReferralCode: 'ENT_ISO',
        agreementVersion: 'v2.1',
      });

      await submitAndVerifyPartnerTaxForm({
        partnerId: partner.id,
        taxFormType: 'w9',
        taxFormFileId: 'file-w9-001',
        complianceDecision: 'verified',
        reviewerUserId: reviewerUser,
      });

      await createCommissionAgreement({
        tenantId,
        partnerId: partner.id,
        modelType: 'volume_percentage',
        rateBasisPoints: 20, // 20 bps
      });

      // Cycle 1: Oct 2026 ($100k volume -> $200 commission)
      const commOct = await calculateMonthlyPartnerCommission({
        tenantId,
        partnerId: partner.id,
        billingCycle: '2026-10',
        totalReferredVolumeUsd: 100000.0,
        totalPlatformFeeUsd: 3000.0,
      });

      // Cycle 2: Nov 2026 ($200k volume -> $400 commission)
      const commNov = await calculateMonthlyPartnerCommission({
        tenantId,
        partnerId: partner.id,
        billingCycle: '2026-11',
        totalReferredVolumeUsd: 200000.0,
        totalPlatformFeeUsd: 6000.0,
      });

      const dashboard = await getPartnerPortalDashboard({
        tenantId,
        partnerId: partner.id,
        activeCommissions: [commOct, commNov],
        referredMerchants: [
          {
            companyId: 'co-merchant-1',
            companyName: 'Acme Supermarket',
            attributedAt: '2026-10-01T12:00:00Z',
            currentCycleVolumeUsd: 120000.0,
          },
          {
            companyId: 'co-merchant-2',
            companyName: 'Nordic Retail Group',
            attributedAt: '2026-10-15T15:30:00Z',
            currentCycleVolumeUsd: 80000.0,
          },
        ],
      });

      expect(dashboard.partner.partnerName).toBe('Enterprise Payment Partners');
      expect(dashboard.metrics.totalReferredMerchantsCount).toBe(2);
      expect(dashboard.metrics.allTimeReferredVolumeUsd).toBe(300000.0);
      expect(dashboard.metrics.allTimeCommissionEarnedUsd).toBe(600.0);
      expect(dashboard.metrics.pendingAccruedCommissionUsd).toBe(600.0);
      expect(dashboard.metrics.taxHoldEscrowUsd).toBe(0.0);
      expect(dashboard.referredMerchants.length).toBe(2);
    });
  });

  describe('Payout Batch Inclusion & Ledger Clearing', () => {
    it('successfully queues accrued partner commission into mass payout batch', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Verified Payout Partner',
        partnerType: 'referral',
        agreementVersion: 'v2.1',
      });

      await submitAndVerifyPartnerTaxForm({
        partnerId: partner.id,
        taxFormType: 'w9',
        taxFormFileId: 'file-w9-002',
        complianceDecision: 'verified',
        reviewerUserId: reviewerUser,
      });

      await createCommissionAgreement({
        tenantId,
        partnerId: partner.id,
        modelType: 'fixed_bounty',
        bountyAmountUsd: 250.0,
      });

      const comm = await calculateMonthlyPartnerCommission({
        tenantId,
        partnerId: partner.id,
        billingCycle: '2026-10',
        totalReferredVolumeUsd: 50000.0,
        totalPlatformFeeUsd: 1500.0,
        activatedMerchantsCount: 2,
      });

      expect(comm.status).toBe('accrued');
      expect(comm.earnedCommissionUsd).toBe(500.0);

      const payout = await includePartnerCommissionInPayoutBatch({
        tenantId,
        partnerId: partner.id,
        commission: comm,
        payoutBatchId: mockPayoutBatchId,
        destinationType: 'ach',
        destinationMasked: '••••9876',
      });

      expect(payout.status).toBe('completed');
      expect(payout.payoutAmountUsd).toBe(500.0);
      expect(payout.ledgerClearingJournalId).toBeDefined();
      expect(comm.status).toBe('paid');
    });

    it('rejects payout batch inclusion if partner tax form is unverified', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Tax Unverified Partner',
        partnerType: 'referral',
        agreementVersion: 'v2.1',
      });

      // DO NOT verify tax form
      await createCommissionAgreement({
        tenantId,
        partnerId: partner.id,
        modelType: 'fixed_bounty',
        bountyAmountUsd: 100.0,
      });

      const comm = await calculateMonthlyPartnerCommission({
        tenantId,
        partnerId: partner.id,
        billingCycle: '2026-10',
        totalReferredVolumeUsd: 10000.0,
        totalPlatformFeeUsd: 300.0,
        activatedMerchantsCount: 1,
      });

      expect(comm.status).toBe('tax_hold');

      await expect(
        includePartnerCommissionInPayoutBatch({
          tenantId,
          partnerId: partner.id,
          commission: comm,
          payoutBatchId: mockPayoutBatchId,
          destinationType: 'ach',
          destinationMasked: '••••1234',
        })
      ).rejects.toThrow(/Tax form is not verified/);
    });
  });
});
