// path: tests/currency/settlement-currency.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeMerchantCurrencySettlement,
  getCurrencySettlement,
  resetCurrencySettlementsStore,
} from '@/lib/currency/settlement-currency';
import {
  ingestFxRatesBatch,
  resetFxRatesStore,
} from '@/lib/currency/fx-engine';

describe('Merchant Preferred Currency Settlement Engine & Ledger Conversion (Step 173)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    resetCurrencySettlementsStore();
    resetFxRatesStore();

    // Ingest exchange rates for CAD and JPY
    await ingestFxRatesBatch(
      tenantId,
      '2026-11-05',
      [
        { targetCurrency: 'CAD', midMarketRate: 1.385500 },
        { targetCurrency: 'JPY', midMarketRate: 150.000000 },
      ],
      1.5
    );
  });

  describe('USD Direct Settlement (No Conversion)', () => {
    it('settles 1:1 in USD with zero FX margin when merchant currency is USD', async () => {
      const rec = await executeMerchantCurrencySettlement({
        tenantId,
        companyId,
        usdAmount: 1500.0,
        settlementCurrency: 'USD',
      });

      expect(rec.settlementCurrency).toBe('USD');
      expect(rec.settlementAmount).toBe(1500.0);
      expect(rec.fxMarginRevenueUsd).toBe(0.0);
      expect(rec.effectiveFxRate).toBe(1.0);
      expect(rec.status).toBe('completed');
      expect(rec.ledgerJournalId).toBeDefined();
    });
  });

  describe('Multi-Currency Payout Conversion (CAD & JPY)', () => {
    it('converts USD to CAD applying 1.0% margin and formats to 2 decimal places', async () => {
      // 1000 USD to CAD. Mid-market = 1.385500. 1% margin -> effective rate = 1.371645
      const rec = await executeMerchantCurrencySettlement({
        tenantId,
        companyId,
        usdAmount: 1000.0,
        settlementCurrency: 'CAD',
        customConversionMarginPct: 1.0,
      });

      expect(rec.settlementCurrency).toBe('CAD');
      expect(rec.midMarketRate).toBe(1.3855);
      expect(rec.effectiveFxRate).toBe(1.371645);
      expect(rec.settlementAmount).toBe(1371.65);
      expect(rec.fxMarginRevenueUsd).toBe(10.0); // 1% of $1,000
      expect(rec.status).toBe('completed');

      const stored = getCurrencySettlement(rec.id);
      expect(stored?.id).toBe(rec.id);
    });

    it('converts USD to JPY respecting zero-decimal precision', async () => {
      // 500 USD to JPY. Mid-market = 150.0. 1% margin -> effective rate = 148.5
      const rec = await executeMerchantCurrencySettlement({
        tenantId,
        companyId,
        usdAmount: 500.0,
        settlementCurrency: 'JPY',
        customConversionMarginPct: 1.0,
      });

      expect(rec.settlementCurrency).toBe('JPY');
      expect(rec.settlementAmount).toBe(74250);
      expect(Number.isInteger(rec.settlementAmount)).toBe(true);
      expect(rec.fxMarginRevenueUsd).toBe(5.0);
    });

    it('throws on unsupported settlement currency', async () => {
      await expect(
        executeMerchantCurrencySettlement({
          tenantId,
          companyId,
          usdAmount: 500.0,
          settlementCurrency: 'XYZ_INVALID',
        })
      ).rejects.toThrow(/Unsupported settlement currency/);
    });
  });
});
