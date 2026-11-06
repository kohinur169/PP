// path: lib/logger/redact.ts

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passcode/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /cvv/i,
  /cvc/i,
  /security[_-]?code/i,
  /pan/i,
  /card[_-]?num/i,
  /credit[_-]?card/i,
  /ssn/i,
  /social[_-]?security/i,
  /tax[_-]?id/i,
  /ein/i,
  /routing[_-]?num/i,
  /account[_-]?num/i,
  /bank[_-]?account/i,
];

// PAN Pattern: 13-19 digits ending on a digit (never eats trailing spaces)
const PAN_REGEX = /\b(?:\d[ -]?){12,18}\d\b/g;

// SSN Pattern: 3 digits - 2 digits - 4 digits
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

// Bearer Token Pattern: Authorization: Bearer eyJ...
const BEARER_REGEX = /Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi;

// Key-value / Query token patterns (e.g. token=secret123, api_key=xyz)
const INLINE_SECRET_REGEX = /\b(token|secret|password|passcode|api[_-]?key)=([^\s&,;]+)/gi;

/**
 * Masks a credit card Primary Account Number (PAN), retaining first 4 and last 4 digits.
 */
function maskPan(panStr: string): string {
  const digits = panStr.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return panStr;
  const firstFour = digits.slice(0, 4);
  const lastFour = digits.slice(-4);
  const maskedMiddle = '*'.repeat(digits.length - 8);
  return `${firstFour}${maskedMiddle}${lastFour}`;
}

/**
 * Redacts known sensitive patterns inside arbitrary string values.
 */
export function redactString(str: string): string {
  if (!str || typeof str !== 'string') return '';

  return str
    .replace(BEARER_REGEX, 'Bearer [REDACTED]')
    .replace(INLINE_SECRET_REGEX, '$1=[REDACTED]')
    .replace(SSN_REGEX, '***-**-****')
    .replace(PAN_REGEX, (match) => maskPan(match));
}

/**
 * Checks if an object property key matches sensitive credential or PII patterns.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively redacts sensitive keys and PII patterns in any data structure.
 * Safeguarded against circular references via WeakSet.
 */
export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'object') {
    // Avoid circular reference infinite recursion
    if (seen.has(value)) {
      return '[Circular Reference]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, seen));
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactString(value.message),
        stack: value.stack ? redactString(value.stack) : undefined,
      };
    }

    const redactedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSensitiveKey(k)) {
        redactedObj[k] = '[REDACTED]';
      } else {
        redactedObj[k] = redactValue(v, seen);
      }
    }
    return redactedObj;
  }

  return String(value);
}
