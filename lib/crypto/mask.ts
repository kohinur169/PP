// path: lib/crypto/mask.ts

/**
 * Universal Masking & Sensitive Value Formatting Utilities.
 * Enforces KD Solution IT security baseline:
 * - Full secrets and gateway keys are NEVER displayed after initial storage
 * - Only the last 4 characters are shown alongside the last updated timestamp
 * - Short inputs (< 4 chars) are completely masked to prevent length and content leakage
 */

export interface MaskSecretOptions {
  readonly visibleSuffixLength?: number | undefined;
  readonly maskChar?: string | undefined;
  readonly fixedMaskLength?: number | undefined;
}

/**
 * Masks a sensitive secret key or credential string, leaving only the trailing characters visible.
 * Default behavior: 12 bullet characters ('•') followed by the last 4 characters.
 * Example: "sk_live_9876543210abcdef" -> "••••••••••••cdef"
 */
export function maskSecret(
  value: string | null | undefined,
  visibleSuffixLength: number = 4,
  maskChar: string = '•'
): string {
  if (!value || typeof value !== 'string') {
    return maskChar.repeat(16);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return maskChar.repeat(16);
  }

  // If the secret is shorter than or equal to the suffix length, redact entirely
  if (trimmed.length <= visibleSuffixLength) {
    return maskChar.repeat(12);
  }

  const suffix = trimmed.slice(-visibleSuffixLength);
  const prefixMask = maskChar.repeat(12);

  return `${prefixMask}${suffix}`;
}

/**
 * Formats a payment card representation complying with PCI DSS v4.0 masking rules.
 * Displays only the last 4 digits, optionally prefixed with the card brand name.
 * Example: maskCardNumber("4242", "Visa") -> "Visa •••• 4242"
 * Example: maskCardNumber("4242") -> "•••• •••• •••• 4242"
 */
export function maskCardNumber(
  last4: string | null | undefined,
  brand?: string | null | undefined
): string {
  const sanitizedLast4 = (last4 ?? '0000').slice(-4).padStart(4, '0');

  if (brand && brand.trim().length > 0) {
    return `${brand.trim()} •••• ${sanitizedLast4}`;
  }

  return `•••• •••• •••• ${sanitizedLast4}`;
}

/**
 * Masks a payout bank account number, displaying only the last 4 digits.
 * Example: maskBankAccount("7890", "SG") -> "••••••••7890 (SG)"
 */
export function maskBankAccount(
  last4: string | null | undefined,
  country?: string | null | undefined
): string {
  const sanitizedLast4 = (last4 ?? '0000').slice(-4).padStart(4, '0');
  const baseMask = `••••••••${sanitizedLast4}`;

  if (country && country.trim().length > 0) {
    return `${baseMask} (${country.toUpperCase().trim()})`;
  }

  return baseMask;
}

/**
 * Masks an email address to protect customer/merchant PII.
 * Example: "developer@kdsolution.it" -> "d•••••••r@kdsolution.it"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) {
    return '••••••@••••••.com';
  }

  const [localPart, domainPart] = email.split('@');
  if (!localPart || !domainPart) {
    return '••••••@••••••.com';
  }

  if (localPart.length <= 2) {
    return `${localPart[0] ?? '•'}•••@${domainPart}`;
  }

  const firstChar = localPart[0];
  const lastChar = localPart[localPart.length - 1];
  const maskedLocal = `${firstChar}${'•'.repeat(Math.min(localPart.length - 2, 7))}${lastChar}`;

  return `${maskedLocal}@${domainPart}`;
}

/**
 * Masks a government tax identification number / EIN.
 * Example: "12-3456789" -> "••-•••6789"
 */
export function maskTaxId(taxId: string | null | undefined): string {
  if (!taxId || taxId.length < 4) {
    return '••-•••••••';
  }

  const sanitized = taxId.replace(/[^a-zA-Z0-9]/g, '');
  if (sanitized.length <= 4) {
    return '••••••••';
  }

  const last4 = sanitized.slice(-4);
  return `••-•••${last4}`;
}
