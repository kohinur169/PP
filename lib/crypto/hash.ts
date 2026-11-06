// path: lib/crypto/hash.ts

import crypto from 'node:crypto';
import { deriveDomainKey } from './keys';

/**
 * Normalizes an identity document number (Passport, National ID, Driver's License).
 * Removes all spaces, hyphens, punctuation, dots, and converts to uppercase.
 * Example: " P123-456-789. " -> "P123456789"
 */
export function normalizeIdentityDocument(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[\s\-_./\\,]/g, '').toUpperCase().trim();
}

/**
 * Normalizes a corporate or individual tax identification number / EIN / SSN.
 * Strips non-alphanumeric characters and converts to uppercase.
 * Example: " 12-3456789 " -> "123456789"
 */
export function normalizeTaxId(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
}

/**
 * Normalizes a telephone number towards E.164 representation.
 * Strips formatting characters (parentheses, spaces, hyphens, dots).
 * Retains leading '+' if present.
 * Example: " +1 (555) 234-5678 " -> "+15552345678"
 */
export function normalizePhone(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digitsOnly}` : digitsOnly;
}

/**
 * Normalizes a bank account number by stripping whitespace and dashes.
 */
export function normalizeBankAccount(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[\s\-]/g, '').trim();
}

/**
 * Normalizes a bank routing number, ACH code, or SWIFT/BIC identifier.
 */
export function normalizeRoutingCode(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[\s\-]/g, '').toUpperCase().trim();
}

/**
 * Generates a deterministic HMAC-SHA256 blind index hash for a normalized value.
 * Uses a derived PII subkey by default to maintain cryptographic domain isolation.
 */
export function generateBlindIndex(
  normalizedValue: string,
  key?: Buffer | string | undefined
): string {
  if (!normalizedValue) {
    throw new Error('Blind index generation requires a non-empty normalized value.');
  }

  const hmacKey = key
    ? Buffer.isBuffer(key)
      ? key
      : Buffer.from(key, 'utf8')
    : deriveDomainKey('pii', { context: 'blind-index' });

  return crypto
    .createHmac('sha256', hmacKey)
    .update(normalizedValue, 'utf8')
    .digest('hex');
}

/**
 * Normalizes an identity document and generates its deterministic blind index.
 */
export function generateDocumentBlindIndex(
  docNumber: string,
  key?: Buffer | string | undefined
): string {
  const normalized = normalizeIdentityDocument(docNumber);
  return generateBlindIndex(normalized, key);
}

/**
 * Normalizes a government tax identification number and generates its blind index.
 */
export function generateTaxIdBlindIndex(
  taxId: string,
  key?: Buffer | string | undefined
): string {
  const normalized = normalizeTaxId(taxId);
  return generateBlindIndex(normalized, key);
}

/**
 * Normalizes a telephone number and generates its blind index.
 */
export function generatePhoneBlindIndex(
  phone: string,
  key?: Buffer | string | undefined
): string {
  const normalized = normalizePhone(phone);
  return generateBlindIndex(normalized, key);
}

/**
 * Generates a collision-resistant bank account fingerprint combining routing/SWIFT
 * code and account number.
 * Example: routing="DBSSSGSG", account="123456789" -> HMAC-SHA256("DBSSSGSG:123456789")
 */
export function generateBankAccountFingerprint(
  routingOrSwift: string,
  accountNumber: string,
  key?: Buffer | string | undefined
): string {
  const normalizedRouting = normalizeRoutingCode(routingOrSwift);
  const normalizedAccount = normalizeBankAccount(accountNumber);

  if (!normalizedRouting || !normalizedAccount) {
    throw new Error(
      'Bank account fingerprint requires both valid routing/SWIFT code and account number.'
    );
  }

  const composite = `${normalizedRouting}:${normalizedAccount}`;
  return generateBlindIndex(composite, key);
}
