// path: tests/crypto/mask.test.ts

import { describe, it, expect } from 'vitest';
import {
  maskSecret,
  maskCardNumber,
  maskBankAccount,
  maskEmail,
  maskTaxId,
} from '../../lib/crypto/mask';

describe('Step 033: Masked Display & Sensitive Value Formatting Utility', () => {
  describe('maskSecret() Core Masking & Leak Prevention', () => {
    it('verifies quality gate: sk_live_9876543210abcdef produces ••••••••••••cdef', () => {
      const apiKey = 'sk_live_9876543210abcdef';
      const masked = maskSecret(apiKey);

      expect(masked).toBe('••••••••••••cdef');
      expect(masked).not.toContain('sk_live');
      expect(masked).not.toContain('9876543210');
      expect(masked.endsWith('cdef')).toBe(true);
    });

    it('safely completely redacts inputs shorter than or equal to visible suffix length', () => {
      // Inputs <= 4 chars must NEVER leak plain characters
      expect(maskSecret('abc')).toBe('••••••••••••');
      expect(maskSecret('12')).toBe('••••••••••••');
      expect(maskSecret('x')).toBe('••••••••••••');
      expect(maskSecret('1234')).toBe('••••••••••••');
    });

    it('handles null, undefined, and empty string safely', () => {
      expect(maskSecret(null)).toBe('••••••••••••••••');
      expect(maskSecret(undefined)).toBe('••••••••••••••••');
      expect(maskSecret('')).toBe('••••••••••••••••');
      expect(maskSecret('   ')).toBe('••••••••••••••••');
    });

    it('supports custom visible suffix lengths', () => {
      const secret = 'webhook_sec_abc123xyz789';
      const masked = maskSecret(secret, 6);

      expect(masked).toBe('••••••••••••xyz789');
      expect(masked.endsWith('xyz789')).toBe(true);
    });
  });

  describe('maskCardNumber() PCI DSS Masking', () => {
    it('formats card numbers with standard 4-block masking', () => {
      expect(maskCardNumber('4242')).toBe('•••• •••• •••• 4242');
      expect(maskCardNumber('1234567812345678')).toBe('•••• •••• •••• 5678');
    });

    it('prepends brand name when provided', () => {
      expect(maskCardNumber('4242', 'Visa')).toBe('Visa •••• 4242');
      expect(maskCardNumber('5555', 'Mastercard')).toBe('Mastercard •••• 5555');
      expect(maskCardNumber('0005', 'American Express')).toBe('American Express •••• 0005');
    });

    it('handles null and undefined card numbers safely', () => {
      expect(maskCardNumber(null)).toBe('•••• •••• •••• 0000');
      expect(maskCardNumber(undefined)).toBe('•••• •••• •••• 0000');
    });
  });

  describe('maskBankAccount() Payout Destination Masking', () => {
    it('masks bank accounts displaying only the last 4 digits', () => {
      expect(maskBankAccount('9876543210')).toBe('••••••••3210');
      expect(maskBankAccount('1234')).toBe('••••••••1234');
    });

    it('includes country code tag when specified', () => {
      expect(maskBankAccount('9876543210', 'SG')).toBe('••••••••3210 (SG)');
      expect(maskBankAccount('12345678', 'US')).toBe('••••••••5678 (US)');
    });

    it('handles null and undefined bank account values', () => {
      expect(maskBankAccount(null)).toBe('••••••••0000');
    });
  });

  describe('maskEmail() & maskTaxId() Identity Protection', () => {
    it('masks email addresses preserving first, last, and domain characters', () => {
      expect(maskEmail('developer@kdsolution.it')).toBe('d•••••••r@kdsolution.it');
      expect(maskEmail('support@kdsolution.it')).toBe('s•••••t@kdsolution.it');
      expect(maskEmail('ab@example.com')).toBe('a•••@example.com');
    });

    it('handles invalid or empty email values safely', () => {
      expect(maskEmail(null)).toBe('••••••@••••••.com');
      expect(maskEmail('invalid-email')).toBe('••••••@••••••.com');
    });

    it('masks government tax ID / EIN values', () => {
      expect(maskTaxId('12-3456789')).toBe('••-•••6789');
      expect(maskTaxId('987654321')).toBe('••-•••4321');
    });

    it('handles short or missing tax ID values safely', () => {
      expect(maskTaxId(null)).toBe('••-•••••••');
      expect(maskTaxId('123')).toBe('••-•••••••');
    });
  });
});
