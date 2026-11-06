// path: tests/provisioning/submerchant-provisioner.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  provisionSubmerchantAfterKyc,
  runApprovedKycProvisioningBatch,
  getSubmerchantAccount,
  resetSubmerchantStore,
  resolveProcessorForMerchant,
  ApprovedKycCandidate,
} from '@/lib/provisioning/submerchant-provisioner';
import {
  saveEmailProviderConfig,
  sendTestEmail,
  activateEmailProviderConfig,
  resetEmailConfigStore,
} from '@/lib/email/provider-config';
import { resetActivityMailerStore } from '@/lib/email/activity-mailer';

describe('Automated Sub-Merchant Provisioning Worker After KYC Approval (Step 164)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const superAdminId = '00000000-0000-4000-8000-000000000001';
  const companyA = '22222222-2222-4222-8222-222222222222';
  const companyB = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    resetSubmerchantStore();
    resetEmailConfigStore();
    resetActivityMailerStore();

    // Setup active email provider so notifications succeed
    const cfg = await saveEmailProviderConfig({
      tenantId,
      providerType: 'resend',
      fromName: 'KD Solution',
      fromEmail: 'support@kdsolution.test',
      secret: 'resend_live_api_key_test_secret',
      actorUserId: superAdminId,
      actorRole: 'super_admin',
    });
    await sendTestEmail({
      configId: cfg.id,
      recipientEmail: 'test@kdsolution.test',
      actorUserId: superAdminId,
    });
    await activateEmailProviderConfig(cfg.id, superAdminId, 'super_admin');
  });

  describe('Processor Routing Resolution (Step 164.1)', () => {
    it('resolves correct upstream gateway based on merchant jurisdiction', () => {
      expect(resolveProcessorForMerchant('US', 'USD')).toBe('nmi');
      expect(resolveProcessorForMerchant('CA', 'CAD')).toBe('stripe_connect');
      expect(resolveProcessorForMerchant('GB', 'GBP')).toBe('stripe_connect');
      expect(resolveProcessorForMerchant('SG', 'SGD')).toBe('airwallex');
      expect(resolveProcessorForMerchant('BR', 'USD')).toBe('rainforest');
    });
  });

  describe('Sub-Merchant Provisioning Lifecycle (Step 164.2)', () => {
    const candidate: ApprovedKycCandidate = {
      kycReviewId: 'kyc_review_001',
      tenantId,
      companyId: companyA,
      companyName: 'Acme E-Commerce LLC',
      contactEmail: 'billing@acme.test',
      country: 'US',
      currency: 'USD',
      riskTier: 2,
      mccCode: '5732',
      singleTransactionCapUsd: 2500,
      monthlyVolumeCapUsd: 250000,
      rollingReservePercent: 7.5,
    };

    it('provisions active sub-merchant account with full capabilities and risk profile metadata', async () => {
      const res = await provisionSubmerchantAfterKyc(candidate);

      expect(res.status).toBe('active');
      expect(res.companyId).toBe(companyA);
      expect(res.providerName).toBe('nmi');
      expect(res.providerSubmerchantId).toContain('sub_nmi_');
      expect(res.emailSent).toBe(true);

      const stored = getSubmerchantAccount(tenantId, companyA);
      expect(stored).toBeDefined();
      expect(stored?.status).toBe('active');
      expect(stored?.capabilities.card_payments).toBe(true);
      expect(stored?.capabilities.transfers).toBe(true);
      expect(stored?.capabilities.payouts).toBe(true);
      expect(stored?.metadata.riskTier).toBe(2);
      expect(stored?.metadata.mccCode).toBe('5732');
      expect(stored?.metadata.monthlyVolumeCapUsd).toBe(250000);
      expect(stored?.metadata.rollingReservePercent).toBe(7.5);
    });

    it('is idempotent when invoked multiple times for already active sub-merchant', async () => {
      const first = await provisionSubmerchantAfterKyc(candidate);
      const second = await provisionSubmerchantAfterKyc(candidate);

      expect(first.submerchantId).toBe(second.submerchantId);
      expect(first.providerSubmerchantId).toBe(second.providerSubmerchantId);
      expect(second.emailSent).toBe(false); // No duplicate email sent on redundant invocation
    });

    it('processes batch of approved KYC candidates across multiple countries', async () => {
      const batch: ApprovedKycCandidate[] = [
        candidate,
        {
          kycReviewId: 'kyc_review_002',
          tenantId,
          companyId: companyB,
          companyName: 'Global Tech Ltd',
          contactEmail: 'finance@globaltech.test',
          country: 'SG',
          currency: 'SGD',
          riskTier: 1,
          mccCode: '5311',
          singleTransactionCapUsd: 500,
          monthlyVolumeCapUsd: 50000,
          rollingReservePercent: 5.0,
        },
      ];

      const results = await runApprovedKycProvisioningBatch(batch);

      expect(results.length).toBe(2);
      expect(results[0].providerName).toBe('nmi');
      expect(results[1].providerName).toBe('airwallex');
      expect(results[1].status).toBe('active');
      expect(results[1].emailSent).toBe(true);

      const storedB = getSubmerchantAccount(tenantId, companyB);
      expect(storedB?.providerName).toBe('airwallex');
      expect(storedB?.metadata.riskTier).toBe(1);
    });
  });
});

