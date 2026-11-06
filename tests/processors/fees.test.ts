// path: tests/processors/fees.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  calculateProcessorCost,
  recordProcessorFeeDebit,
  clearTenantFeeSchedules,
} from '@/lib/processors/fees';

describe('Processor Fee Modeling & Interchange++ Cost Tracking Engine (Step 129)', () => {
  beforeEach(() => {
    clearTenantFeeSchedules();
  });

  describe('Standard Domestic and International Calculations (Step 129.2)', () => {
    it('calculates exact domestic card processor cost for $100.00 on Stripe Connect', () => {
      const amount = Money.from('100.0000');
      const breakdown = calculateProcessorCost({
        amount,
        provider: 'stripe_connect',
        isInternational: false,
      });

      expect(breakdown.grossAmount.toNumericString()).toBe('100.0000');
      expect(breakdown.percentageFee.toNumericString()).toBe('2.9000');
      expect(breakdown.fixedFee.toNumericString()).toBe('0.3000');
      expect(breakdown.internationalSurcharge.toNumericString()).toBe('0.0000');
      expect(breakdown.totalProcessorFee.toNumericString()).toBe('3.2000');
      expect(breakdown.netSettlementAmount.toNumericString()).toBe('96.8000');
      expect(breakdown.effectiveRatePercent).toBe('3.2000%');
    });

    it('calculates exact international card processor cost for $100.00 on Stripe Connect with surcharge', () => {
      const amount = Money.from('100.0000');
      const breakdown = calculateProcessorCost({
        amount,
        provider: 'stripe_connect',
        isInternational: true, // +1.5% surcharge
      });

      expect(breakdown.grossAmount.toNumericString()).toBe('100.0000');
      expect(breakdown.percentageFee.toNumericString()).toBe('2.9000');
      expect(breakdown.fixedFee.toNumericString()).toBe('0.3000');
      expect(breakdown.internationalSurcharge.toNumericString()).toBe('1.5000');
      expect(breakdown.totalProcessorFee.toNumericString()).toBe('4.7000');
      expect(breakdown.netSettlementAmount.toNumericString()).toBe('95.3000');
      expect(breakdown.effectiveRatePercent).toBe('4.7000%');
    });

    it('calculates NMI enterprise gateway fee with Amex card brand surcharge', () => {
      const amount = Money.from('200.0000');
      const breakdown = calculateProcessorCost({
        amount,
        provider: 'nmi',
        cardBrand: 'amex', // +0.5% surcharge
        isInternational: false,
      });

      // 2.4% of $200 = $4.8000
      expect(breakdown.percentageFee.toNumericString()).toBe('4.8000');
      // Fixed fee = $0.2000
      expect(breakdown.fixedFee.toNumericString()).toBe('0.2000');
      // Amex surcharge = 0.5% of $200 = $1.0000
      expect(breakdown.amexSurcharge.toNumericString()).toBe('1.0000');
      // Total = 4.8000 + 0.2000 + 1.0000 = $6.0000
      expect(breakdown.totalProcessorFee.toNumericString()).toBe('6.0000');
      expect(breakdown.netSettlementAmount.toNumericString()).toBe('194.0000');
    });

    it('calculates Payoneer mass payout commercial fee schedule', () => {
      const amount = Money.from('1000.0000');
      const breakdown = calculateProcessorCost({
        amount,
        provider: 'payoneer',
        paymentMethod: 'payout',
      });

      // 1.0% of $1000 = $10.0000, fixed fee = $1.5000 -> total = $11.5000
      expect(breakdown.percentageFee.toNumericString()).toBe('10.0000');
      expect(breakdown.fixedFee.toNumericString()).toBe('1.5000');
      expect(breakdown.totalProcessorFee.toNumericString()).toBe('11.5000');
      expect(breakdown.netSettlementAmount.toNumericString()).toBe('988.5000');
    });
  });

  describe('Precision & Decimal Math Invariants (Step 129.4)', () => {
    it('performs exact numeric(18,4) Decimal calculations without floating point drift on non-round amounts', () => {
      const nonRoundAmount = Money.from('123.4567');
      const breakdown = calculateProcessorCost({
        amount: nonRoundAmount,
        provider: 'rainforest', // 2.7% + $0.25
        isInternational: true, // +1.0%
      });

      // 2.7% of 123.4567 = 3.3333309 -> rounded to 3.3333
      // Fixed fee = 0.2500
      // 1.0% of 123.4567 = 1.234567 -> rounded to 1.2346
      // Total = 3.3333 + 0.2500 + 1.2346 = 4.8179
      expect(breakdown.totalProcessorFee.toNumericString()).toBe('4.8179');
      // Net settlement = 123.4567 - 4.8179 = 118.6388
      expect(breakdown.netSettlementAmount.toNumericString()).toBe('118.6388');
    });

    it('rejects zero or negative transaction amounts with a clean error', () => {
      expect(() =>
        calculateProcessorCost({
          amount: Money.from('0.0000'),
          provider: 'stripe_connect',
        })
      ).toThrow('must be strictly greater than zero');

      expect(() =>
        calculateProcessorCost({
          amount: Money.from('-50.0000'),
          provider: 'stripe_connect',
        })
      ).toThrow('must be strictly greater than zero');
    });
  });

  describe('Transaction Fee Debit Recording (Step 129.3)', () => {
    it('records processor fee debit alongside platform fee deduction', () => {
      const grossAmount = Money.from('500.0000');
      const processorCost = Money.from('14.8000');
      const platformFee = Money.from('10.0000'); // 2% platform fee

      const record = recordProcessorFeeDebit({
        transactionId: 'tx_payment_998811',
        grossAmount,
        processorCost,
        platformFee,
        provider: 'airwallex',
      });

      expect(record.transactionId).toBe('tx_payment_998811');
      expect(record.provider).toBe('airwallex');
      expect(record.grossAmount).toBe('500.0000');
      expect(record.processorCost).toBe('14.8000');
      expect(record.platformFee).toBe('10.0000');
      // Net merchant payout = 500 - 14.80 - 10.00 = 475.2000
      expect(record.netMerchantPayout).toBe('475.2000');
      expect(record.id).toBeDefined();
    });
  });
});
