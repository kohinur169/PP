// path: tests/accounting/company-accounting.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordCompanyAccountingEntry,
  matchProcessorBill,
  getPlatformOperationsMetrics,
  getSubMerchantOperationsMetrics,
  resetCompanyAccountingStore,
  UnauthorizedCompanyAccountingAccessError,
} from '@/lib/accounting/company-accounting';

describe('Company Accounting & Operations Metrics Isolation Engine (Step 156)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyA = '22222222-2222-4222-8222-222222222222';
  const superAdminId = '99999999-9999-4999-8999-999999999999';
  const financeOpsId = '88888888-8888-4888-8888-888888888888';
  const merchantUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    resetCompanyAccountingStore();
  });

  describe('Strict Accounting Isolation & RBAC (Step 156.1)', () => {
    it('restricts company accounting strictly to super_admin, CEO and finance_ops', async () => {
      // finance_ops allowed
      const entry = await recordCompanyAccountingEntry({
        tenantId,
        entryType: 'income',
        category: 'platform_markup_fees',
        amountUsd: 14250.75,
        actorUserId: financeOpsId,
        actorRole: 'finance_ops',
      });

      expect(entry.id).toBeDefined();
      expect(entry.amountUsd).toBe(14250.75);

      // merchant denied
      await expect(
        recordCompanyAccountingEntry({
          tenantId,
          entryType: 'income',
          category: 'merchant_attempt',
          amountUsd: 100,
          actorUserId: merchantUserId,
          actorRole: 'merchant_admin',
        })
      ).rejects.toThrow(UnauthorizedCompanyAccountingAccessError);

      // support denied
      await expect(
        recordCompanyAccountingEntry({
          tenantId,
          entryType: 'income',
          category: 'support_attempt',
          amountUsd: 100,
          actorUserId: merchantUserId,
          actorRole: 'support',
        })
      ).rejects.toThrow(UnauthorizedCompanyAccountingAccessError);
    });
  });

  describe('Processor Bill Matching & Reconciliation (Step 156.2)', () => {
    it('accurately verifies matching bills and flags discrepancy mismatches', async () => {
      // 1. Matched bill (discrepancy 0)
      const matched = await matchProcessorBill({
        tenantId,
        processor: 'nmi',
        billingPeriod: '2026-10',
        billedAmountUsd: 3450.25,
        matchedLedgerAmountUsd: 3450.25,
        actorUserId: financeOpsId,
        actorRole: 'finance_ops',
      });

      expect(matched.isMatched).toBe(true);
      expect(matched.discrepancyUsd).toBe(0);

      // 2. Unmatched bill with fee discrepancy
      const unmatched = await matchProcessorBill({
        tenantId,
        processor: 'airwallex',
        billingPeriod: '2026-10',
        billedAmountUsd: 1250.0,
        matchedLedgerAmountUsd: 1235.5,
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      expect(unmatched.isMatched).toBe(false);
      expect(unmatched.discrepancyUsd).toBe(14.5);
    });
  });

  describe('Operations Metrics Invariant (Step 156.3)', () => {
    it('provides super_admin with holistic platform numbers and merchants with strictly own numbers', async () => {
      // 1. Record company income and expense
      await recordCompanyAccountingEntry({
        tenantId,
        entryType: 'income',
        category: 'processing_margin',
        amountUsd: 25000.0,
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      await recordCompanyAccountingEntry({
        tenantId,
        entryType: 'expense',
        category: 'gateway_fixed_costs',
        amountUsd: 4000.0,
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      // 2. Global platform operations metrics for office
      const platformMetrics = await getPlatformOperationsMetrics(tenantId, 'super_admin');
      expect(platformMetrics.totalTransactionVolumeUsd).toBeGreaterThan(0);
      expect(platformMetrics.activeMerchantCount).toBeGreaterThan(0);
      expect(platformMetrics.overallChargebackRatePct).toBeLessThan(1.0);
      expect(platformMetrics.platformRevenueUsd).toBe(21000.0); // 25,000 - 4,000

      // 3. Sub-merchant sees strictly its own numbers
      const merchantMetrics = await getSubMerchantOperationsMetrics({
        tenantId,
        companyId: companyA,
        actorUserId: merchantUserId,
      });

      expect(merchantMetrics.companyId).toBe(companyA);
      expect(merchantMetrics.ownVolumeUsd).toBe(28450.0);
      expect(merchantMetrics.ownChargebackRatePct).toBe(0.12);
      expect(merchantMetrics.ownHoldReserveUsd).toBe(2845.0);
      expect(merchantMetrics.ownAvailableBalanceUsd).toBe(21400.0);

      // Verify merchant cannot see platform revenue field
      expect((merchantMetrics as unknown as Record<string, unknown>).platformRevenueUsd).toBeUndefined();
    });
  });
});
