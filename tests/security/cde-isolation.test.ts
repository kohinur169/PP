// path: tests/security/cde-isolation.test.ts

import { describe, it, expect } from 'vitest';
import { isLuhnValid, scanPayloadForPan } from '@/lib/security/pan-detector';
import { scanCodebaseForPanLeakage } from '@/scripts/scan-pan-leakage';

describe('Cardholder Data Environment (CDE) Complete Isolation (Step 131)', () => {
  describe('Luhn Checksum Algorithm', () => {
    it('correctly verifies valid Visa, Mastercard, and Amex test card numbers', () => {
      expect(isLuhnValid('4000000000000002')).toBe(true); // Visa test
      expect(isLuhnValid('4242424242424242')).toBe(true); // Visa standard
      expect(isLuhnValid('5555555555554444')).toBe(true); // Mastercard test
      expect(isLuhnValid('378282246310005')).toBe(true); // Amex test
    });

    it('rejects invalid card numbers with incorrect checksum or length', () => {
      expect(isLuhnValid('4000000000000003')).toBe(false); // Bad check digit
      expect(isLuhnValid('12345')).toBe(false); // Too short
      expect(isLuhnValid('1234567890123456789012345')).toBe(false); // Too long
    });
  });

  describe('Server-Side Payload PAN Scanner (Step 131.3)', () => {
    it('detects embedded raw card numbers in incoming payload strings', () => {
      const payloadWithPan = JSON.stringify({
        customer: 'John Doe',
        notes: 'Please charge card 4242 4242 4242 4242 manually',
      });

      const result = scanPayloadForPan(payloadWithPan);
      expect(result.hasPan).toBe(true);
      expect(result.detectedCount).toBe(1);
    });

    it('passes safe payloads containing tokens, amounts, and metadata', () => {
      const safePayload = JSON.stringify({
        token: 'tok_1MockToken9911',
        amount: '150.0000',
        currency: 'USD',
        companyId: '01a1ab20-2e5b-70c6-803d-7c39cbbd621b',
      });

      const result = scanPayloadForPan(safePayload);
      expect(result.hasPan).toBe(false);
      expect(result.detectedCount).toBe(0);
    });
  });

  describe('AST Codebase Form Input Scanner (Step 131.1)', () => {
    it('verifies that zero native input elements handle raw card data across the codebase', () => {
      const scanResult = scanCodebaseForPanLeakage();
      expect(scanResult.passed).toBe(true);
      expect(scanResult.violations.length).toBe(0);
      expect(scanResult.totalFilesScanned).toBeGreaterThan(100);
    });
  });
});
