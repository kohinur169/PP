// path: tests/cms/pricing-and-accounting.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  proposePricingVersion,
  signOffPricingVersion,
  evaluatePublicPricing,
  resetPricingStore,
  DEFAULT_ACTIVE_PRICING,
} from '@/lib/cms/pricing';
import {
  recordCorporateAccountingEntry,
  generateCorporateProfitAndLoss,
  assertAccountingRbacAccess,
  resetAccountingStore,
} from '@/lib/accounting/company-books';

describe('Pricing Versions, 30-Day Notice & Corporate Accounting (Steps 235, 237-238)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const superAdminId = '00000000-0000-4000-8000-000000000001';
  const ceoId = '00000000-0000-4000-8000-000000000002';

  beforeEach(() => {
    resetPricingStore();
    resetAccountingStore();
  });

  describe('Step 235: Public Transparent Pricing Page & 30-Day Advance Version Notice', () => {
    it('returns baseline active pricing initially', () => {
      const evaluation = evaluatePublicPricing();
      expect(evaluation.activeVersion.versionNumber).toBe('v1.0.0');
      expect(evaluation.isAdvanceNoticeActive).toBe(false);
    });

    it('rejects pricing proposal scheduled less than 30 days in advance', async () => {
      const shortNoticeDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
      await expect(
        proposePricingVersion({
          tenantId,
          versionNumber: 'v2.0.0-early',
          platformFeePercent: 0.032,
          platformFeeFixedUsd: '0.3500',
          chargebackFeeUsd: '20.0000',
          effectiveDate: shortNoticeDate,
          proposedBy: superAdminId,
        })
      ).rejects.toThrow(/Mandatory 30-day advance notice rule/);
    });

    it('accepts proposal 45 days in advance and renders notice banner after dual approval', async () => {
      const advanceDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
      const proposal = await proposePricingVersion({
        tenantId,
        versionNumber: 'v2.0.0',
        platformFeePercent: 0.0275,
        platformFeeFixedUsd: '0.2500',
        chargebackFeeUsd: '15.0000',
        effectiveDate: advanceDate,
        proposedBy: superAdminId,
      });

      expect(proposal.versionNumber).toBe('v2.0.0');

      // Before dual approval, advance notice banner is not active
      let evalNotice = evaluatePublicPricing();
      expect(evalNotice.isAdvanceNoticeActive).toBe(false);

      // Super Admin and CEO dual sign-off
      await signOffPricingVersion({
        versionNumber: 'v2.0.0',
        signerId: superAdminId,
        signerRole: 'super_admin',
      });
      await signOffPricingVersion({
        versionNumber: 'v2.0.0',
        signerId: ceoId,
        signerRole: 'ceo',
      });

      evalNotice = evaluatePublicPricing();
      expect(evalNotice.isAdvanceNoticeActive).toBe(true);
      expect(evalNotice.noticeBannerMessage).toContain('v2.0.0');
      expect(evalNotice.daysUntilEffective).toBeGreaterThanOrEqual(44);
    });
  });

  describe('Step 237 & Step 238: Internal Platform Corporate Accounting & Strict RBAC Isolation', () => {
    it('blocks unauthorized roles from accessing corporate accounting books', () => {
      expect(() => assertAccountingRbacAccess('submerchant_admin')).toThrow(/Unauthorized/);
      expect(() => assertAccountingRbacAccess('support_agent')).toThrow(/Unauthorized/);
      expect(() => assertAccountingRbacAccess('blogger')).toThrow(/Unauthorized/);

      // Allowed roles
      expect(() => assertAccountingRbacAccess('super_admin')).not.toThrow();
      expect(() => assertAccountingRbacAccess('ceo')).not.toThrow();
      expect(() => assertAccountingRbacAccess('finance_ops')).not.toThrow();
    });

    it('records corporate income and expenses and computes accurate net P&L', async () => {
      // 1. Accrue platform fee revenue ($12,000)
      await recordCorporateAccountingEntry({
        tenantId,
        category: 'platform_fees',
        entryType: 'revenue',
        amountUsd: '12000.0000',
        description: 'Monthly platform transaction processing fees',
        vendorOrSource: 'Acquiring Settlement Network',
        userRole: 'finance_ops',
        userId: 'usr_fin_01',
      });

      // 2. Accrue subscription fees ($3,500)
      await recordCorporateAccountingEntry({
        tenantId,
        category: 'subscription_fees',
        entryType: 'revenue',
        amountUsd: '3500.0000',
        description: 'Pro plan monthly merchant subscriptions',
        vendorOrSource: 'Merchant Platform Subscriptions',
        userRole: 'super_admin',
        userId: superAdminId,
      });

      // 3. Log processor interchange bill ($4,200)
      await recordCorporateAccountingEntry({
        tenantId,
        category: 'processor_interchange',
        entryType: 'expense',
        amountUsd: '4200.0000',
        description: 'Acquiring processor monthly statement',
        vendorOrSource: 'Stripe / NMI Wholesale Interchange',
        userRole: 'finance_ops',
        userId: 'usr_fin_01',
      });

      // 4. Log operating overhead expense ($1,300)
      await recordCorporateAccountingEntry({
        tenantId,
        category: 'operating_overhead',
        entryType: 'expense',
        amountUsd: '1300.0000',
        description: 'Infrastructure cloud server cluster hosting',
        vendorOrSource: 'Cloud Compute Corp',
        userRole: 'finance_ops',
        userId: 'usr_fin_01',
      });

      const report = generateCorporateProfitAndLoss(tenantId, 'ceo');
      expect(report.totalRevenueUsd).toBe('15500.0000'); // 12000 + 3500
      expect(report.totalExpensesUsd).toBe('5500.0000');   // 4200 + 1300
      expect(report.netOperatingIncomeUsd).toBe('10000.0000'); // 15500 - 5500
      expect(report.entriesCount).toBe(4);
    });
  });
});
