// path: tests/partners/commission-engine.test.ts

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

describe('Partner Revenue Share Commission & Tiered Volume Engine (Step 182)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const reviewerUser = '88888888-8888-4888-8888-888888888888';

  beforeEach(() => {
    resetPartnerEngineStore();
    resetCommissionEngineStore();
  });

  describe('Tiered Volume Percentage Model', () => {
    it('graduates partner to Tier 2 (15 bps) on $250k monthly volume', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Global ISO Network',
        partnerType: 'iso',
        agreementVersion: 'v2.1',
      });

      // Verify tax form
      await submitAndVerifyPartnerTaxForm({
        partnerId: partner.id,
        taxFormType: 'w9',
        taxFormFileId: '01a1ac11-0000-7000-8000-000000000001',
        complianceDecision: 'verified',
        reviewerUserId: reviewerUser,
      });

      // Agreement with 3 volume tiers
      await createCommissionAgreement({
        tenantId,
        partnerId: partner.id,
        modelType: 'volume_percentage',
        tieredStructure: [
          { minVolumeUsd: 0, maxVolumeUsd: 100000, rateBasisPoints: 10, tierName: 'Bronze Tier' },
          { minVolumeUsd: 100000, maxVolumeUsd: 500000, rateBasisPoints: 15, tierName: 'Silver Tier' },
          { minVolumeUsd: 500000, rateBasisPoints: 25, tierName: 'Gold Tier' },
        ],
      });

      const comm = await calculateMonthlyPartnerCommission({
        tenantId,
        partnerId: partner.id,
        billingCycle: '2026-10',
        totalReferredVolumeUsd: 250000.0,
        totalPlatformFeeUsd: 7500.0,
      });

      expect(comm.effectiveTier).toBe('Silver Tier');
      expect(comm.earnedCommissionUsd).toBe(375.0); // (250,000 * 15) / 10,000 = $375.00
      expect(comm.status).toBe('accrued');
      expect(comm.ledgerJournalId).toBeDefined();
    });
  });

  describe('Platform Fee Share & Bounty Models', () => {
    it('computes 20% platform revenue share', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Fintech Referral Partner',
        partnerType: 'referral',
        agreementVersion: 'v2.1',
      });

      await submitAndVerifyPartnerTaxForm({
        partnerId: partner.id,
        taxFormType: 'w9',
        taxFormFileId: '01a1ac11-0000-7000-8000-000000000002',
        complianceDecision: 'verified',
        reviewerUserId: reviewerUser,
      });

      await createCommissionAgreement({
        tenantId,
        partnerId: partner.id,
        modelType: 'platform_fee_percentage',
        feeSharePercentage: 20.0, // 20% of net platform fee
      });

      const comm = await calculateMonthlyPartnerCommission({
        tenantId,
        partnerId: partner.id,
        billingCycle: '2026-10',
        totalReferredVolumeUsd: 150000.0,
        totalPlatformFeeUsd: 4500.0,
      });

      expect(comm.earnedCommissionUsd).toBe(900.0); // 20% of $4,500 = $900.00
      expect(comm.status).toBe('accrued');
    });

    it('computes fixed bounty for 5 onboarded merchants', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Bounty Hunter Partner',
        partnerType: 'referral',
        agreementVersion: 'v2.1',
      });

      await submitAndVerifyPartnerTaxForm({
        partnerId: partner.id,
        taxFormType: 'w8ben',
        taxFormFileId: '01a1ac11-0000-7000-8000-000000000003',
        complianceDecision: 'verified',
        reviewerUserId: reviewerUser,
      });

      await createCommissionAgreement({
        tenantId,
        partnerId: partner.id,
        modelType: 'fixed_bounty',
        bountyAmountUsd: 150.0, // $150 per merchant
      });

      const comm = await calculateMonthlyPartnerCommission({
        tenantId,
        partnerId: partner.id,
        billingCycle: '2026-10',
        totalReferredVolumeUsd: 50000.0,
        totalPlatformFeeUsd: 1500.0,
        activatedMerchantsCount: 5,
      });

      expect(comm.earnedCommissionUsd).toBe(750.0); // 5 * $150 = $750.00
      expect(comm.effectiveTier).toBe('Fixed Bounty');
    });
  });

  describe('Tax Form Compliance Escrow Gate', () => {
    it('places commission on tax_hold if partner W-9/W-8BEN is pending verification', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Unverified Tax Partner',
        partnerType: 'referral',
        agreementVersion: 'v2.1',
      });

      // DO NOT verify tax form -> remains 'pending'
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
        activatedMerchantsCount: 2,
      });

      expect(comm.earnedCommissionUsd).toBe(200.0);
      expect(comm.status).toBe('tax_hold'); // Strictly escrowed until tax form verified!
    });
  });
});
