// path: tests/partners/partner-engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPartner,
  submitAndVerifyPartnerTaxForm,
  recordReferralClick,
  attributeMerchantRegistration,
  getPartner,
  getReferralAttribution,
  resetPartnerEngineStore,
} from '@/lib/partners/partner-engine';

describe('Partner Onboarding, W-9/W-8BEN Verification & Referral Attribution (Step 181)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const reviewerUser = '88888888-8888-4888-8888-888888888888';
  const newMerchantCo = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    resetPartnerEngineStore();
  });

  describe('Partner Registration & Tax Form Gate', () => {
    it('registers partner in pending review state and activates upon W-9 verification', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Apex ISO Holdings',
        partnerType: 'iso',
        customReferralCode: 'APEX_PAY',
        agreementVersion: 'v2.1_2026',
      });

      expect(partner.partnerName).toBe('Apex ISO Holdings');
      expect(partner.referralCode).toBe('APEX_PAY');
      expect(partner.status).toBe('pending_review');
      expect(partner.taxFormStatus).toBe('pending');

      // Submit and verify W-9 tax document
      const verified = await submitAndVerifyPartnerTaxForm({
        partnerId: partner.id,
        taxFormType: 'w9',
        taxFormFileId: '01a1ac11-0000-7000-8000-000000000001',
        complianceDecision: 'verified',
        reviewerUserId: reviewerUser,
      });

      expect(verified.taxFormStatus).toBe('verified');
      expect(verified.status).toBe('active'); // Now unlocked for commission payouts
    });
  });

  describe('Referral Attribution Engine & 30-Day Window', () => {
    it('tracks referral click and attributes new merchant registration to partner', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Tech Integration Partners',
        partnerType: 'integration',
        customReferralCode: 'TECH_CONNECT',
        agreementVersion: 'v2.1',
      });

      // 1. Visitor clicks partner referral link
      const click = await recordReferralClick({
        tenantId,
        referralCode: 'TECH_CONNECT',
        visitorIp: '198.51.100.42',
        landingUrl: 'https://kd.pay/signup?ref=TECH_CONNECT',
      });

      expect(click.status).toBe('clicked');
      expect(click.attributionToken).toBeDefined();
      expect(click.partnerId).toBe(partner.id);

      // Verify expiration is set 30 days into future
      const expiresAt = new Date(click.expiresAt).getTime();
      const now = Date.now();
      const diffDays = Math.round((expiresAt - now) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);

      // 2. Merchant completes onboarding registration
      const attr = await attributeMerchantRegistration({
        tenantId,
        attributionToken: click.attributionToken,
        companyId: newMerchantCo,
      });

      expect(attr.status).toBe('registered');
      expect(attr.referredCompanyId).toBe(newMerchantCo);

      const stored = getReferralAttribution(click.attributionToken);
      expect(stored?.referredCompanyId).toBe(newMerchantCo);
    });

    it('rejects attribution when token has expired past 30 days', async () => {
      const partner = await registerPartner({
        tenantId,
        partnerName: 'Referral Pro',
        partnerType: 'referral',
        customReferralCode: 'REF_PRO',
        agreementVersion: 'v2.1',
      });

      const click = await recordReferralClick({
        tenantId,
        referralCode: 'REF_PRO',
        visitorIp: '203.0.113.19',
        landingUrl: 'https://kd.pay/?ref=REF_PRO',
      });

      // Simulate expired token (35 days old)
      click.expiresAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      await expect(
        attributeMerchantRegistration({
          tenantId,
          attributionToken: click.attributionToken,
          companyId: newMerchantCo,
        })
      ).rejects.toThrow(/Attribution token has expired/);

      expect(click.status).toBe('expired');
    });
  });
});
