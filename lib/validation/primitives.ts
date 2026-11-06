// path: lib/validation/primitives.ts
import { z } from 'zod';
import { sanitizeString } from '@/lib/security/sanitize';
import { toNumeric18_4 } from '@/lib/money';

// UUID v7 Pattern: 8-4-4-4-12 with version nibble '7' and variant [89ab]
const UUIDV7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_GENERAL_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// E.164 International Phone Regex: + followed by 1 to 15 digits
const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

// ISO 3166-1 alpha-2 Country Code Regex (2 uppercase letters)
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

// MCC (Merchant Category Code): exactly 4 numeric digits
const MCC_REGEX = /^\d{4}$/;

// Monetary string: positive/zero number with up to 14 integer digits and up to 4 decimal places
const MONEY_STRING_REGEX = /^\d{1,14}(\.\d{1,4})?$/;

/**
 * UUIDv7 schema validator ensuring timestamp-ordered RFC 9562 identifiers.
 */
export const UUIDv7Schema = z
  .string()
  .trim()
  .regex(UUIDV7_REGEX, { message: 'Invalid UUIDv7 identifier format' });

/**
 * General UUID schema validator.
 */
export const UUIDSchema = z
  .string()
  .trim()
  .regex(UUID_GENERAL_REGEX, { message: 'Invalid UUID identifier format' });

/**
 * Normalized Email Schema: trimmed, lowercased, and validated.
 */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: 'Invalid email address format' })
  .max(255, { message: 'Email address exceeds maximum length of 255 characters' });

/**
 * E.164 Phone Number Schema (e.g. "+12025550123").
 */
export const PhoneE164Schema = z
  .string()
  .trim()
  .regex(E164_PHONE_REGEX, { message: 'Phone number must be in E.164 international format (e.g. +12025550123)' });

/**
 * ISO 3166-1 alpha-2 Country Code Schema (e.g. "US", "SG", "GB").
 */
export const CountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(COUNTRY_CODE_REGEX, { message: 'Country code must be a 2-letter ISO 3166-1 alpha-2 code' });

/**
 * Platform Currency Schema: Strictly USD only per platform mandate.
 */
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((val) => val === 'USD', { message: 'Currency must strictly be USD' });

/**
 * Merchant Category Code (MCC) Schema: exactly 4 digits.
 */
export const MccCodeSchema = z
  .string()
  .trim()
  .regex(MCC_REGEX, { message: 'Merchant Category Code (MCC) must be exactly 4 numeric digits' });

/**
 * Monetary String Schema conforming to PostgreSQL numeric(18,4).
 * Validates format, positive value, and transforms into normalized 4-decimal representation.
 */
export const MoneyStringSchema = z
  .string()
  .trim()
  .refine((val) => MONEY_STRING_REGEX.test(val.replace(/[$,]/g, '')), {
    message: 'Monetary amount must be a valid non-negative number with up to 4 decimal places',
  })
  .transform((val) => toNumeric18_4(val.replace(/[$,]/g, '')));

/**
 * Safe Text Schema: Automatically applies multi-vector input sanitization
 * stripping null bytes, directory traversal markers, and XSS tags.
 */
export const SafeTextSchema = (maxLength = 255) =>
  z
    .string()
    .transform((val) => sanitizeString(val, { stripHtml: true, removePathTraversal: true }))
    .refine((val) => val.length <= maxLength, {
      message: `Text exceeds maximum length of ${maxLength} characters`,
    });

/**
 * Idempotency Key Schema (16 to 128 characters).
 */
export const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(16, { message: 'Idempotency key must be at least 16 characters' })
  .max(128, { message: 'Idempotency key exceeds maximum length of 128 characters' });

/**
 * Standard Pagination Schema for list APIs.
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
