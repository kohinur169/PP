// path: tests/currency/dcc-engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDccQuote,
  decideDccOffer,
  getDccQuote,
  resetDccStore,
} from '@/lib/currency/dcc-engine';
import {
  ingestFxRatesBatch,
  resetFxRatesStore,
} from '@/lib/currency/fx-engine';

describe('Dynamic Currency Conversion (DCC) Offer Engine (Step 171)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const paymentIntentId = '01a1abbf-0001-7000-8000-000000000001';

  beforeEach(async () => {
    resetDccStore();
    resetFxRatesStore();

    // Ingest EUR and JPY exchange rates
    await ingestFxRatesBatch(
      tenantId,
      '2026-11-05',
      [
        { targetCurrency: 'EUR', midMarketRate: 0.920000 },
        { targetCurrency: 'JPY', midMarketRate: 150.000000 },
      ],
      1.5 // 1.5% margin
    );
  });

  describe('DCC Offer Eligibility & Generation (Step 171.1)', () => {
    it('returns ineligible when cardholder currency is already USD', async () => {
      const res = await generateDccQuote({
        tenantId,
        paymentIntentId,
        merchantAmountUsd: 100,
        cardholderCurrency: 'USD',
      });

      expect(res.eligibleForDcc).toBe(false);
      expect(res.reason).toContain('matches merchant base currency');
    });

    it('generates transparent side-by-side quote with 10-minute TTL for EUR cardholder', async () => {
      const now = '2026-11-05T12:00:00Z';
      const res = await generateDccQuote({
        tenantId,
        paymentIntentId,
        merchantAmountUsd: 100,
        cardholderCurrency: 'EUR',
        nowIso: now,
      });

      expect(res.eligibleForDcc).toBe(true);
      const quote = res.quote!;
      expect(quote).toBeDefined();

      // Mid-market 0.92 * 1.015 = 0.933800. 100 USD -> 93.38 EUR
      expect(quote.customerRate).toBe(0.9338);
      expect(quote.cardholderAmount).toBe(93.38);
      expect(quote.merchantAmount).toBe(100);
      expect(quote.marginPercent).toBe(1.5);
      expect(quote.markupAmountUsd).toBe(1.5);

      // Verify transparent disclosure statement
      expect(quote.disclosureStatement).toContain('includes 1.50% conversion fee');
      expect(quote.disclosureStatement).toContain('mid-market rate: 0.920000 EUR');

      // Verify 10-minute expiration TTL
      expect(quote.expiresAt).toBe('2026-11-05T12:10:00.000Z');
    });

    it('respects zero-decimal precision for JPY DCC quote', async () => {
      const res = await generateDccQuote({
        tenantId,
        paymentIntentId,
        merchantAmountUsd: 50,
        cardholderCurrency: 'JPY',
      });

      expect(res.eligibleForDcc).toBe(true);
      const quote = res.quote!;
      // Mid-market 150 * 1.015 = 152.25. 50 USD * 152.25 = 7613 JPY (integer)
      expect(quote.cardholderAmount).toBe(7613);
      expect(Number.isInteger(quote.cardholderAmount)).toBe(true);
    });
  });

  describe('Cardholder Choice Decision & TTL Enforcement (Step 171.2)', () => {
    it('charges card in local currency when DCC is accepted', async () => {
      const offer = await generateDccQuote({
        tenantId,
        paymentIntentId,
        merchantAmountUsd: 200,
        cardholderCurrency: 'EUR',
        nowIso: '2026-11-05T12:00:00Z',
      });

      const quoteId = offer.quote!.id;

      const decision = await decideDccOffer({
        quoteId,
        acceptDcc: true,
        nowIso: '2026-11-05T12:02:00Z',
      });

      expect(decision.isAccepted).toBe(true);
      expect(decision.chargedCurrency).toBe('EUR');
      expect(decision.chargedAmount).toBe(186.76); // 200 * 0.9338
      expect(decision.settledUsdAmount).toBe(200);

      const stored = getDccQuote(quoteId);
      expect(stored?.isAccepted).toBe(true);
    });

    it('charges card in USD when DCC is declined', async () => {
      const offer = await generateDccQuote({
        tenantId,
        paymentIntentId,
        merchantAmountUsd: 200,
        cardholderCurrency: 'EUR',
        nowIso: '2026-11-05T12:00:00Z',
      });

      const quoteId = offer.quote!.id;

      const decision = await decideDccOffer({
        quoteId,
        acceptDcc: false,
        nowIso: '2026-11-05T12:02:00Z',
      });

      expect(decision.isAccepted).toBe(false);
      expect(decision.chargedCurrency).toBe('USD');
      expect(decision.chargedAmount).toBe(200);
      expect(decision.settledUsdAmount).toBe(200);
    });

    it('rejects decisions made after quote TTL has expired', async () => {
      const offer = await generateDccQuote({
        tenantId,
        paymentIntentId,
        merchantAmountUsd: 200,
        cardholderCurrency: 'EUR',
        nowIso: '2026-11-05T12:00:00Z', // Expires at 12:10:00Z
      });

      const quoteId = offer.quote!.id;

      await expect(
        decideDccOffer({
          quoteId,
          acceptDcc: true,
          nowIso: '2026-11-05T12:11:00Z', // 11 minutes later -> Expired!
        })
      ).rejects.toThrow(/has expired/);
    });
  });
});
