// path: tests/crypto/hash.test.ts

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  normalizeIdentityDocument,
  normalizeTaxId,
  normalizePhone,
  normalizeBankAccount,
  normalizeRoutingCode,
  generateBlindIndex,
  generateDocumentBlindIndex,
  generateTaxIdBlindIndex,
  generatePhoneBlindIndex,
  generateBankAccountFingerprint,
} from '../../lib/crypto/hash';

describe('Step 035: PII HMAC-SHA256 Blind Indexing & Document Hashing Utilities', () => {
  const customKey = crypto.randomBytes(32);

  describe('PII Normalization Helpers', () => {
    it('normalizes identity document numbers stripping spaces, hyphens, and dots to uppercase', () => {
      expect(normalizeIdentityDocument(' p 123-456-789. ')).toBe('P123456789');
      expect(normalizeIdentityDocument('E12345678')).toBe('E12345678');
      expect(normalizeIdentityDocument('AB/CD-99.11')).toBe('ABCD9911');
      expect(normalizeIdentityDocument('')).toBe('');
      expect(normalizeIdentityDocument(null)).toBe('');
    });

    it('normalizes tax IDs stripping non-alphanumeric characters', () => {
      expect(normalizeTaxId(' 12-3456789 ')).toBe('123456789');
      expect(normalizeTaxId('99-888-7777')).toBe('998887777');
      expect(normalizeTaxId('US-EIN: 12-3456789')).toBe('USEIN123456789');
    });

    it('normalizes phone numbers retaining international E.164 leading plus', () => {
      expect(normalizePhone(' +1 (555) 234-5678 ')).toBe('+15552345678');
      expect(normalizePhone('01711-234567')).toBe('01711234567');
      expect(normalizePhone('+65 6789 0123')).toBe('+6567890123');
    });

    it('normalizes bank accounts and routing codes', () => {
      expect(normalizeBankAccount(' 123-456-789 ')).toBe('123456789');
      expect(normalizeRoutingCode(' dbss-sgsg ')).toBe('DBSSSGSG');
    });
  });

  describe('Blind Index Generation & Invariant Verification', () => {
    it('verifies identical normalized identity documents produce identical blind indexes regardless of formatting', () => {
      const docA = ' P 123-456-789 ';
      const docB = 'p123456789';
      const docC = 'P-123.456/789';

      const hashA = generateDocumentBlindIndex(docA, customKey);
      const hashB = generateDocumentBlindIndex(docB, customKey);
      const hashC = generateDocumentBlindIndex(docC, customKey);

      expect(hashA).toBe(hashB);
      expect(hashB).toBe(hashC);
      expect(hashA).toHaveLength(64); // SHA-256 hex string
    });

    it('verifies identical formatted tax IDs produce identical blind index hashes', () => {
      const taxA = ' 12-3456789 ';
      const taxB = '123456789';

      const hashA = generateTaxIdBlindIndex(taxA, customKey);
      const hashB = generateTaxIdBlindIndex(taxB, customKey);

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
    });

    it('verifies different identity documents produce distinct blind hashes', () => {
      const hash1 = generateDocumentBlindIndex('P11111111', customKey);
      const hash2 = generateDocumentBlindIndex('P22222222', customKey);

      expect(hash1).not.toBe(hash2);
    });

    it('normalizes and blind-indexes telephone numbers consistently', () => {
      const phoneA = '+1 (555) 019-2834';
      const phoneB = '+1-555-019-2834';

      const hashA = generatePhoneBlindIndex(phoneA, customKey);
      const hashB = generatePhoneBlindIndex(phoneB, customKey);

      expect(hashA).toBe(hashB);
    });
  });

  describe('Bank Account Fingerprint Utilities', () => {
    it('generates consistent fingerprint combining routing/SWIFT code and account number', () => {
      const fp1 = generateBankAccountFingerprint('DBSSSGSG', '123-456-7890', customKey);
      const fp2 = generateBankAccountFingerprint('dbss-sgsg', '1234567890', customKey);

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it('differentiates accounts with different routing codes or account numbers', () => {
      const fp1 = generateBankAccountFingerprint('DBSSSGSG', '1234567890', customKey);
      const fpDiffRouting = generateBankAccountFingerprint('OCBCSGSG', '1234567890', customKey);
      const fpDiffAccount = generateBankAccountFingerprint('DBSSSGSG', '9999999999', customKey);

      expect(fp1).not.toBe(fpDiffRouting);
      expect(fp1).not.toBe(fpDiffAccount);
    });

    it('throws error when routing or account number is empty', () => {
      expect(() => generateBankAccountFingerprint('', '12345')).toThrow();
      expect(() => generateBankAccountFingerprint('ROUTING', '')).toThrow();
    });
  });

  describe('Key Isolation & Error Handling', () => {
    it('produces distinct blind hashes under different keys for the same input', () => {
      const otherKey = crypto.randomBytes(32);
      const val = 'PASSPORT-XYZ-123';

      const hashKey1 = generateDocumentBlindIndex(val, customKey);
      const hashKey2 = generateDocumentBlindIndex(val, otherKey);

      expect(hashKey1).not.toBe(hashKey2);
    });

    it('throws error if normalized value is empty', () => {
      expect(() => generateBlindIndex('')).toThrow(
        'Blind index generation requires a non-empty normalized value.'
      );
    });
  });
});
