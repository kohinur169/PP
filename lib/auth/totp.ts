// path: lib/auth/totp.ts
import crypto from 'node:crypto';
import type {
  TotpSetupResult,
  TotpVerifyOptions,
  TotpVerifyResult,
  BackupCodeVerifyResult,
} from './totp-types';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer into a standard RFC 4648 Base32 string without padding.
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string into a binary Buffer.
 */
export function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[\s\-=]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) {
      throw new Error(`Invalid Base32 character: "${char}"`);
    }

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates an RFC 6238 6-digit Time-based One-Time Password (TOTP)
 * using HMAC-SHA1 and 30-second time steps.
 */
export function generateTotp(secretBase32: string, timestampMs: number = Date.now()): string {
  const step = Math.floor(timestampMs / 1000 / 30);
  const key = base32Decode(secretBase32);

  // 8-byte big-endian counter buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(step), 0);

  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

  // Dynamic truncation (RFC 4226)
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binaryCode =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = (binaryCode % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verifies a 6-digit TOTP token against a Base32 secret with clock skew tolerance (+/-1 step)
 * and replay protection.
 */
export function verifyTotp(
  token: string,
  secretBase32: string,
  options?: TotpVerifyOptions
): TotpVerifyResult {
  const cleanToken = (token || '').trim();
  if (!/^\d{6}$/.test(cleanToken)) {
    return { valid: false, error: 'Token must be exactly 6 numeric digits' };
  }

  const timestampMs = options?.timestamp ?? Date.now();
  const window = options?.window ?? 1;
  const currentStep = Math.floor(timestampMs / 1000 / 30);
  const lastUsedStep =
    options?.lastUsedStep !== undefined ? Number(options.lastUsedStep) : -1;

  for (let i = -window; i <= window; i++) {
    const step = currentStep + i;
    const testTimeMs = step * 30 * 1000;
    const expectedOtp = generateTotp(secretBase32, testTimeMs);

    if (expectedOtp === cleanToken) {
      // Replay attack defense
      if (step <= lastUsedStep) {
        return {
          valid: false,
          step,
          error: 'Replay detected: this one-time code was already consumed',
        };
      }

      return {
        valid: true,
        step,
      };
    }
  }

  return {
    valid: false,
    error: 'Invalid or expired one-time code',
  };
}

/**
 * Generates a high-entropy Base32 secret (20 random bytes = 160 bits).
 */
export function generateTotpSecret(numBytes: number = 20): string {
  const randomBytes = crypto.randomBytes(numBytes);
  return base32Encode(randomBytes);
}

/**
 * Generates standard otpauth:// URI for authenticator applications (Google Authenticator, 1Password, etc.).
 */
export function generateOtpAuthUri(
  email: string,
  secretBase32: string,
  issuer: string = 'KD SOLUTION IT'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates single-use 10-character alphanumeric recovery backup codes with SHA-256 hashes.
 */
export function generateRecoveryCodes(count: number = 8): {
  plainCodes: string[];
  hashedCodes: string[];
} {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes ambiguous 0, O, 1, I

  for (let i = 0; i < count; i++) {
    let code = '';
    const bytes = crypto.randomBytes(10);
    for (let j = 0; j < 10; j++) {
      code += alphabet[bytes[j]! % alphabet.length];
    }
    // Format as 5-5: XXXXX-XXXXX
    const formatted = `${code.slice(0, 5)}-${code.slice(5)}`;
    plainCodes.push(formatted);

    // Compute SHA-256 hash of normalized code (alphanumeric only)
    const normalized = code.toUpperCase();
    const hash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
    hashedCodes.push(hash);
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verifies and consumes a single-use backup recovery code against stored hashes.
 */
export function verifyAndConsumeBackupCode(
  inputCode: string,
  existingHashes: string[]
): BackupCodeVerifyResult {
  if (!inputCode || typeof inputCode !== 'string') {
    return { valid: false, error: 'Empty or invalid recovery code' };
  }

  const normalized = inputCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length !== 10) {
    return { valid: false, error: 'Recovery code must be 10 characters long' };
  }

  const inputHash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');

  const matchIndex = existingHashes.indexOf(inputHash);
  if (matchIndex === -1) {
    return { valid: false, error: 'Invalid or already consumed recovery code' };
  }

  // Remove the matched hash
  const remainingHashes = existingHashes.filter((_, idx) => idx !== matchIndex);

  return {
    valid: true,
    consumedIndex: matchIndex,
    remainingHashes,
  };
}

/**
 * Orchestrates full TOTP MFA setup for a user.
 */
export function setupTotpMfa(
  email: string,
  issuer: string = 'KD SOLUTION IT'
): TotpSetupResult {
  const secret = generateTotpSecret(20);
  const otpauthUri = generateOtpAuthUri(email, secret, issuer);
  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

  return {
    secret,
    otpauthUri,
    recoveryCodes: plainCodes,
    recoveryCodeHashes: hashedCodes,
  };
}
