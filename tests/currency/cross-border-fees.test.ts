// path: tests/currency/cross-border-fees.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateTransactionFeeBreakdown,
  getFeeBreakdown,
  resetFeeBreakdownsStore,
} from '@/lib/currency/cross-border-fees';

describe('Cross-Border Payment Fee Calculation Engine & Interchange Assessment (Step 172)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    resetFeeBreakdownsStore();
  });

  describe('Domestic vs Cross-Border Surcharge Invariants (Step 172.1)', () => {
    it('applies standard base fee without international surcharges on domestic US cards', async () => {
      const breakdown = await calculateTransactionFeeBreakdown({
        tenantId,
        paymentId: 'pay_domestic_001',
        grossAmountUsd: 100.0,
        cardBrand: 'visa',
        cardCountry: 'US',
        merchantCountry: 'US',
        transactionCurrency: 'USD',
      });

      expect(breakdown.isCrossBorder).toBe(false);
      expect(breakdown.isCrossCurrency).toBe(false);
      // Base fee = 100 * 0.029 + 0.30 = 3.20
      expect(breakdown.baseFeeUsd).toBe(3.20);
      expect(breakdown.crossBorderAssessmentUsd).toBe(0.0);
      expect(breakdown.currencyConversionAssessmentUsd).toBe(0.0);
      expect(breakdown.totalProcessorFeeUsd).toBe(3.20);
      expect(breakdown.netAmountUsd).toBe(96.80);
      expect(breakdown.effectiveFeeRatePct).toBe(3.20);
    });

    it('applies 0.40% cross-border fee for international card charged in merchant base currency', async () => {
      const breakdown = await calculateTransactionFeeBreakdown({
        tenantId,
        paymentId: 'pay_cross_border_single_002',
        grossAmountUsd: 100.0,
        cardBrand: 'mastercard',
        cardCountry: 'GB', // United Kingdom card
        merchantCountry: 'US',
        transactionCurrency: 'USD', // Single currency
      });

      expect(breakdown.isCrossBorder).toBe(true);
      expect(breakdown.isCrossCurrency).toBe(false);
      expect(breakdown.baseFeeUsd).toBe(3.20);
      // 0.40% cross-border assessment = $0.40
      expect(breakdown.crossBorderAssessmentUsd).toBe(0.40);
      expect(breakdown.currencyConversionAssessmentUsd).toBe(0.0);
      // Total fee = 3.20 + 0.40 = 3.60
      expect(breakdown.totalProcessorFeeUsd).toBe(3.60);
      expect(breakdown.netAmountUsd).toBe(96.40);
    });

    it('applies 0.40% cross-border AND 0.80% currency conversion fee for multi-currency transactions', async () => {
      const breakdown = await calculateTransactionFeeBreakdown({
        tenantId,
        paymentId: 'pay_cross_border_multi_003',
        grossAmountUsd: 100.0,
        cardBrand: 'visa',
        cardCountry: 'CA', // Canadian card
        merchantCountry: 'US',
        transactionCurrency: 'CAD', // Multi currency
      });

      expect(breakdown.isCrossBorder).toBe(true);
      expect(breakdown.isCrossCurrency).toBe(true);
      expect(breakdown.baseFeeUsd).toBe(3.20);
      // 0.40% cross-border = $0.40
      expect(breakdown.crossBorderAssessmentUsd).toBe(0.40);
      // 0.80% currency conversion = $0.80
      expect(breakdown.currencyConversionAssessmentUsd).toBe(0.80);
      // Total fee = 3.20 + 0.40 + 0.80 = 4.40
      expect(breakdown.totalProcessorFeeUsd).toBe(4.40);
      expect(breakdown.netAmountUsd).toBe(95.60);
    });
  });

  describe('Card Brand Specific Surcharges (Amex)', () => {
    it('applies 0.50% Amex surcharge on American Express transactions', async () => {
      const breakdown = await calculateTransactionFeeBreakdown({
        tenantId,
        paymentId: 'pay_amex_004',
        grossAmountUsd: 100.0,
        cardBrand: 'amex',
        cardCountry: 'US',
        merchantCountry: 'US',
      });

      expect(breakdown.isCrossBorder).toBe(false);
      expect(breakdown.baseFeeUsd).toBe(3.20);
      // Amex surcharge 0.50% = $0.50
      expect(breakdown.amexSurchargeUsd).toBe(0.50);
      // Total = 3.20 + 0.50 = 3.70
      expect(breakdown.totalProcessorFeeUsd).toBe(3.70);
      expect(breakdown.netAmountUsd).toBe(96.30);
    });
  });

  describe('Storage & Retrieval (Step 172.2)', () => {
    it('persists fee breakdown record with unique identifier for settlement reconciliation', async () => {
      const created = await calculateTransactionFeeBreakdown({
        tenantId,
        paymentId: 'pay_persist_005',
        grossAmountUsd: 50.0,
        cardBrand: 'visa',
        cardCountry: 'SG',
        merchantCountry: 'US',
      });

      const retrieved = getFeeBreakdown(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.paymentId).toBe('pay_persist_005');
      expect(retrieved?.grossAmountUsd).toBe(50.0);
    });
  });
});
