// path: tests/processors/routing-waterfall.test.ts

import { describe, it, expect } from 'vitest';
import {
  evaluateProcessorRouting,
  estimateProcessorCosts,
} from '@/lib/processors/routing-waterfall';

describe('Processor Priority Waterfall & Dynamic Routing Engine (Step 178)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';

  describe('Rule #1: Amex Direct Acceptance Routing', () => {
    it('routes American Express transactions to NMI Collect.js direct processing', async () => {
      const res = await evaluateProcessorRouting({
        tenantId,
        companyId,
        cardBrand: 'amex',
        currency: 'USD',
        amountUsd: 150.0,
        issuingCountry: 'US',
      });

      expect(res.selectedProcessor).toBe('nmi');
      expect(res.matchedRuleName).toContain('Amex Direct');
      expect(res.waterfallOrder[0]).toBe('nmi');
    });
  });

  describe('Rule #2: Cross-Border Multi-Currency Optimization', () => {
    it('routes EUR cross-border transactions to Airwallex for native clearing', async () => {
      const res = await evaluateProcessorRouting({
        tenantId,
        companyId,
        cardBrand: 'visa',
        currency: 'EUR',
        amountUsd: 250.0,
        issuingCountry: 'FR',
      });

      expect(res.selectedProcessor).toBe('airwallex');
      expect(res.matchedRuleName).toContain('Cross-Border Multi-Currency');
      expect(res.waterfallOrder[0]).toBe('airwallex');
    });
  });

  describe('Rule #3: Domestic Micro-Transaction Routing', () => {
    it('routes $4.50 domestic transaction to Rainforest for minimum fixed fee', async () => {
      const res = await evaluateProcessorRouting({
        tenantId,
        companyId,
        cardBrand: 'visa',
        currency: 'USD',
        amountUsd: 4.5,
        issuingCountry: 'US',
      });

      expect(res.selectedProcessor).toBe('rainforest');
      expect(res.matchedRuleName).toContain('Micro-Transaction');
      expect(res.waterfallOrder[0]).toBe('rainforest');
    });
  });

  describe('Rule #4: High-Ticket Domestic Basis Points Optimization', () => {
    it('routes $1,200.00 domestic transaction to NMI for lowest variable basis points (2.20%)', async () => {
      const res = await evaluateProcessorRouting({
        tenantId,
        companyId,
        cardBrand: 'mastercard',
        currency: 'USD',
        amountUsd: 1200.0,
        issuingCountry: 'US',
      });

      expect(res.selectedProcessor).toBe('nmi');
      expect(res.matchedRuleName).toContain('High-Ticket');
      expect(res.estimatedCostUsd).toBeLessThan(40.0); // 1200 * 0.022 + 0.20 = $26.60 vs Stripe ($35.10)
    });
  });

  describe('Cost Estimation Calculator', () => {
    it('accurately computes variable and fixed fee components across processors', () => {
      const estimates = estimateProcessorCosts(100.0, true, 'visa', 'USD');
      const nmi = estimates.find((e) => e.processor === 'nmi')!;
      const stripe = estimates.find((e) => e.processor === 'stripe_connect')!;

      // NMI domestic: 100 * 0.022 + 0.20 = 2.40
      expect(nmi.estimatedFeeUsd).toBe(2.4);

      // Stripe domestic: 100 * 0.029 + 0.30 = 3.20
      expect(stripe.estimatedFeeUsd).toBe(3.2);
    });
  });
});
