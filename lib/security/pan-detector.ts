// path: lib/security/pan-detector.ts

import { logger } from '@/lib/logger/logger';

/**
 * Validates a number string using the Luhn checksum algorithm.
 */
export function isLuhnValid(pan: string): boolean {
  const digits = pan.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/**
 * Server-side payload scanner detecting accidental transmission of raw PAN strings (Step 131.3).
 * Raises urgent security alerts and blocks payload to maintain strict PCI-DSS SAQ A scope.
 */
export function scanPayloadForPan(content: string): {
  hasPan: boolean;
  detectedCount: number;
} {
  if (!content || typeof content !== 'string') {
    return { hasPan: false, detectedCount: 0 };
  }

  // Candidate numeric sequence matching 13-19 consecutive digits (with optional spaces/dashes)
  const panRegex = /\b(?:\d[ -]*?){13,19}\b/g;
  const matches = content.match(panRegex) ?? [];

  let detectedCount = 0;

  for (const candidate of matches) {
    const cleanDigits = candidate.replace(/\D/g, '');

    // Skip all-zero or all-one dummy test strings that aren't real PANs
    if (/^0+$|^1+$/.test(cleanDigits)) continue;

    if (isLuhnValid(cleanDigits)) {
      detectedCount++;
      logger.warn('SECURITY ALERT: Raw Primary Account Number (PAN) detected in payload', {
        last4: cleanDigits.slice(-4),
        panLength: cleanDigits.length,
        action: 'PCI_DSS_SAQ_A_BREACH_PREVENTION',
      });
    }
  }

  return {
    hasPan: detectedCount > 0,
    detectedCount,
  };
}
