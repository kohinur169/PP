// path: tests/currency/currency-engine.test.ts

import { describe, it, expect } from 'vitest';
import {
  toMinorUnits,
  fromMinorUnits,
  formatCurrencyAmount,
  normalizeToUsd,
  validateCurrencyAmount,
  SUPPORTED_CURRENCIES,
} from '@/lib/currency/currency-engine';

describe('Multi-Currency Precision Standards & ISO 4217 Currency Engine (Step 169)', () => {
  describe('Zero-Decimal Currencies (JPY, KRW, VND, CLP, etc.)', () => {
    it('handles zero-decimal currency without fractional multiplication', () => {
      expect(SUPPORTED_CURRENCIES.JPY.decimals).toBe(0);
      expect(toMinorUnits(2500, 'JPY')).toBe(2500n);
      expect(fromMinorUnits(2500n, 'JPY')).toBe(2500);
      expect(formatCurrencyAmount(2500, 'JPY')).toBe('¥2,500 JPY');

      expect(SUPPORTED_CURRENCIES.KRW.decimals).toBe(0);
      expect(toMinorUnits(50000, 'KRW')).toBe(50000n);
      expect(fromMinorUnits(50000n, 'KRW')).toBe(50000);
    });

    it('rejects decimal fractions for zero-decimal currencies', () => {
      const res = validateCurrencyAmount(2500.5, 'JPY');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('maximum allowed precision of 0 decimal places');
    });
  });

  describe('3-Decimal Currencies (BHD, KWD, OMR, JOD, TND, etc.)', () => {
    it('handles 3-decimal currencies correctly with 1,000 minor unit factor', () => {
      expect(SUPPORTED_CURRENCIES.KWD.decimals).toBe(3);
      expect(toMinorUnits(15.75, 'KWD')).toBe(15750n);
      expect(toMinorUnits(15.755, 'KWD')).toBe(15755n);
      expect(fromMinorUnits(15755n, 'KWD')).toBe(15.755);
      expect(formatCurrencyAmount(15.755, 'KWD')).toBe('KD15.755 KWD');

      expect(SUPPORTED_CURRENCIES.BHD.decimals).toBe(3);
      expect(toMinorUnits(8.25, 'BHD')).toBe(8250n);
      expect(fromMinorUnits(8250n, 'BHD')).toBe(8.25);
    });

    it('rejects 4 decimal places for 3-decimal currencies', () => {
      const res = validateCurrencyAmount(12.3456, 'KWD');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('maximum allowed precision of 3 decimal places');
    });
  });

  describe('Standard 2-Decimal Currencies (USD, EUR, GBP, CAD, etc.)', () => {
    it('converts between dollars and cents with 100 factor', () => {
      expect(toMinorUnits(10.99, 'USD')).toBe(1099n);
      expect(fromMinorUnits(1099n, 'USD')).toBe(10.99);
      expect(formatCurrencyAmount(10.99, 'USD')).toBe('$10.99 USD');

      expect(toMinorUnits(45.5, 'EUR')).toBe(4550n);
      expect(fromMinorUnits(4550n, 'EUR')).toBe(45.5);
      expect(formatCurrencyAmount(45.5, 'EUR')).toBe('€45.50 EUR');
    });

    it('enforces minimum transaction charge threshold', () => {
      const res = validateCurrencyAmount(0.25, 'USD');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('below minimum allowed charge for USD');

      const ok = validateCurrencyAmount(0.5, 'USD');
      expect(ok.isValid).toBe(true);
    });
  });

  describe('Base Platform USD numeric(18,4) Normalization', () => {
    it('normalizes multi-currency amounts into USD with 4 decimal places', () => {
      // 100 EUR at 1.0855 USD/EUR = 108.55 USD
      expect(normalizeToUsd(100, 1.0855)).toBe(108.55);

      // 10,000 JPY at 0.006543 USD/JPY = 65.43 USD
      expect(normalizeToUsd(10000, 0.006543)).toBe(65.43);

      // Fractional sub-cent precision maintained for ledger
      expect(normalizeToUsd(33.33, 1.25678)).toBe(41.8885);
    });
  });
});
