// path: tests/validation/primitives.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  UUIDv7Schema,
  MoneyStringSchema,
  EmailSchema,
  PhoneE164Schema,
  CountryCodeSchema,
  CurrencyCodeSchema,
  MccCodeSchema,
  SafeTextSchema,
  IdempotencyKeySchema,
  validateData,
} from '@/lib/validation';

describe('Zod Validation Framework for Client & Server APIs (Step 006)', () => {
  describe('UUIDv7 Schema Primitive', () => {
    it('should accept valid timestamp-ordered UUIDv7 strings', () => {
      const validV7 = '018f6c4c-3500-7fa1-b1e2-123456789abc';
      expect(UUIDv7Schema.parse(validV7)).toBe(validV7);
    });

    it('should reject invalid UUID formats and non-v7 UUIDs', () => {
      // UUIDv4 (nibble is 4, not 7)
      const validV4 = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      expect(() => UUIDv7Schema.parse(validV4)).toThrow();
      expect(() => UUIDv7Schema.parse('not-a-uuid')).toThrow();
    });
  });

  describe('MoneyStringSchema Primitive', () => {
    it('should normalize amounts into exact PostgreSQL numeric(18,4) 4-decimal strings', () => {
      expect(MoneyStringSchema.parse('100')).toBe('100.0000');
      expect(MoneyStringSchema.parse('49.99')).toBe('49.9900');
      expect(MoneyStringSchema.parse('$1,250.50')).toBe('1250.5000');
      expect(MoneyStringSchema.parse('0.0001')).toBe('0.0001');
    });

    it('should reject negative amounts and malformed monetary strings', () => {
      expect(() => MoneyStringSchema.parse('-50')).toThrow();
      expect(() => MoneyStringSchema.parse('abc')).toThrow();
      expect(() => MoneyStringSchema.parse('10.12345')).toThrow(); // >4 decimal places
    });
  });

  describe('EmailSchema Primitive', () => {
    it('should normalize email to lowercase and trim whitespace', () => {
      expect(EmailSchema.parse('  Merchant.Admin@KDSolution.IT  ')).toBe('merchant.admin@kdsolution.it');
    });

    it('should reject invalid email structures', () => {
      expect(() => EmailSchema.parse('invalid-email')).toThrow();
      expect(() => EmailSchema.parse('@nodomain.com')).toThrow();
    });
  });

  describe('PhoneE164Schema Primitive', () => {
    it('should accept valid E.164 phone numbers with leading plus', () => {
      expect(PhoneE164Schema.parse('+12025550123')).toBe('+12025550123');
      expect(PhoneE164Schema.parse('+6567890123')).toBe('+6567890123');
    });

    it('should reject local or unformatted phone numbers lacking leading plus', () => {
      expect(() => PhoneE164Schema.parse('01711223344')).toThrow();
      expect(() => PhoneE164Schema.parse('12025550123')).toThrow();
    });
  });

  describe('CountryCode & CurrencyCode Primitives', () => {
    it('should accept 2-letter ISO country codes and uppercase them', () => {
      expect(CountryCodeSchema.parse('us')).toBe('US');
      expect(CountryCodeSchema.parse('SG')).toBe('SG');
      expect(() => CountryCodeSchema.parse('USA')).toThrow(); // 3 letters
    });

    it('should strictly enforce USD currency only per platform policy', () => {
      expect(CurrencyCodeSchema.parse('USD')).toBe('USD');
      expect(CurrencyCodeSchema.parse('usd')).toBe('USD');
      expect(() => CurrencyCodeSchema.parse('EUR')).toThrow();
      expect(() => CurrencyCodeSchema.parse('BDT')).toThrow();
    });
  });

  describe('MccCodeSchema Primitive', () => {
    it('should accept exactly 4 numeric digits for MCC codes', () => {
      expect(MccCodeSchema.parse('5734')).toBe('5734');
      expect(() => MccCodeSchema.parse('573')).toThrow();
      expect(() => MccCodeSchema.parse('57345')).toThrow();
      expect(() => MccCodeSchema.parse('ABCD')).toThrow();
    });
  });

  describe('SafeTextSchema Primitive', () => {
    it('should automatically sanitize XSS and directory traversal from input text', () => {
      const textSchema = SafeTextSchema(100);
      expect(textSchema.parse("Acme Corp <script>alert('xss')</script>")).toBe('Acme Corp');
      expect(textSchema.parse('../../etc/passwd')).toBe('etc/passwd');
    });
  });

  describe('IdempotencyKeySchema Primitive', () => {
    it('should accept high-entropy keys between 16 and 128 characters', () => {
      const validKey = 'idem_key_1234567890abcdef12345';
      expect(IdempotencyKeySchema.parse(validKey)).toBe(validKey);
      expect(() => IdempotencyKeySchema.parse('short')).toThrow();
    });
  });

  describe('RFC 7807 Problem Details Response Formatter', () => {
    it('should transform Zod validation failures into standard RFC 7807 422 Problem Details', () => {
      const testSchema = z.object({
        amount: MoneyStringSchema,
        email: EmailSchema,
        country: CountryCodeSchema,
      });

      const invalidPayload = {
        amount: '-10.00',
        email: 'bad-email',
        country: 'INVALID',
      };

      const result = validateData(testSchema, invalidPayload, {
        instance: '/api/payments/charge',
        correlationId: 'req_12345',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.problem.status).toBe(422);
        expect(result.problem.type).toBe('https://kdsolution.it/errors/validation-error');
        expect(result.problem.instance).toBe('/api/payments/charge');
        expect(result.problem.correlationId).toBe('req_12345');
        expect(result.problem.invalidParams?.length).toBe(3);

        const fieldNames = result.problem.invalidParams?.map((p) => p.name);
        expect(fieldNames).toContain('amount');
        expect(fieldNames).toContain('email');
        expect(fieldNames).toContain('country');
      }
    });

    it('should return typed data directly when validation succeeds', () => {
      const testSchema = z.object({
        email: EmailSchema,
        currency: CurrencyCodeSchema,
      });

      const validPayload = {
        email: 'admin@kdsolution.it',
        currency: 'USD',
      };

      const result = validateData(testSchema, validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('admin@kdsolution.it');
        expect(result.data.currency).toBe('USD');
      }
    });
  });
});
