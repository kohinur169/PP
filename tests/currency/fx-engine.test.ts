// path: tests/currency/fx-engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateCustomerFxRate,
  ingestFxRatesBatch,
  getEffectiveFxRate,
  runDailyFxSyncJob,
  resetFxRatesStore,
  DEFAULT_MID_MARKET_RATES,
} from '@/lib/currency/fx-engine';

describe('FX Rates Ingestion Engine & Configurable Margin (Step 170)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    resetFxRatesStore();
  });

  describe('Margin Markup Invariant (Step 170.1)', () => {
    it('applies configurable margin on mid-market rates with 6 decimal precision', () => {
      // Mid-market 1 USD = 0.920000 EUR. Margin 1.50%
      const customerRate = calculateCustomerFxRate(0.92, 1.5);
      expect(customerRate).toBe(0.9338);

      // Mid-market 1 USD = 150.000000 JPY. Margin 2.00%
      const jpyRate = calculateCustomerFxRate(150.0, 2.0);
      expect(jpyRate).toBe(153.0);
    });
  });

  describe('Batch Ingestion & Rate Lookup with Fallback (Step 170.2)', () => {
    it('ingests rates for multiple currencies and supports stale fallback', async () => {
      const yesterday = '2026-11-04';
      const today = '2026-11-05';

      await ingestFxRatesBatch(
        tenantId,
        yesterday,
        [
          { targetCurrency: 'EUR', midMarketRate: 0.92 },
          { targetCurrency: 'GBP', midMarketRate: 0.77 },
        ],
        1.5
      );

      // Lookup exact date
      const exact = getEffectiveFxRate(tenantId, 'EUR', yesterday);
      expect(exact).toBeDefined();
      expect(exact?.midMarketRate).toBe(0.92);
      expect(exact?.customerRate).toBe(0.9338);

      // Lookup today before today is ingested -> falls back to yesterday's available rate
      const fallback = getEffectiveFxRate(tenantId, 'EUR', today);
      expect(fallback).toBeDefined();
      expect(fallback?.rateDate).toBe(yesterday);
      expect(fallback?.midMarketRate).toBe(0.92);

      // Ingest today's rate
      await ingestFxRatesBatch(
        tenantId,
        today,
        [{ targetCurrency: 'EUR', midMarketRate: 0.925 }],
        1.5
      );

      const updated = getEffectiveFxRate(tenantId, 'EUR', today);
      expect(updated?.rateDate).toBe(today);
      expect(updated?.midMarketRate).toBe(0.925);
    });
  });

  describe('Daily FX Sync Job Worker (Step 170.3)', () => {
    it('synchronizes full catalog of ECB exchange rates with 1.5% margin', async () => {
      const summary = await runDailyFxSyncJob({
        tenantId,
        rateDate: '2026-11-05',
        customMarginPercent: 1.5,
      });

      const catalogLength = Object.keys(DEFAULT_MID_MARKET_RATES).length;
      expect(summary.pairsIngestedCount).toBe(catalogLength);
      expect(summary.feedSource).toBe('ECB');
      expect(summary.defaultMarginPercent).toBe(1.5);

      const jpy = getEffectiveFxRate(tenantId, 'JPY', '2026-11-05');
      expect(jpy).toBeDefined();
      expect(jpy?.midMarketRate).toBe(DEFAULT_MID_MARKET_RATES.JPY);
      expect(jpy?.customerRate).toBe(calculateCustomerFxRate(DEFAULT_MID_MARKET_RATES.JPY, 1.5));
    });
  });
});
