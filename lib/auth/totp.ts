// path: lib/auth/totp.ts
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import * as otplib from 'otplib';
import type {
  TotpSetupResult,
  TotpVerifyOptions,
  TotpVerifyResult,
  BackupCodeVerifyResult,
} from './totp-types';
import type { UserTotpSetupData } from '../../types/mfa';
import { encryptWithDomainKey, decryptWithDomainKey } from '../crypto/aes';
import { UserMfaRepository } from '../db/mfa';
import { AuditLogRepository } from '../db/audit';
import { logger } from '../logger';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const defaultMfaRepo = new UserMfaRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Checks if a string is a standard UUID.
 */
function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

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
    options?.lastUsedStep !== undefined && options.lastUsedStep !== null
      ? Number(options.lastUsedStep)
      : -1;

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
 * Supports optional userId parameter per Step 052.2 or byte length parameter.
 */
export function generateTotpSecret(arg?: number | string): string {
  const numBytes = typeof arg === 'number' ? arg : 20;
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
 * Generates a QR code data URL (PNG) for an otpauth URI using the qrcode library.
 * Step 052.1: qrcode library integration.
 */
export async function generateQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
  });
}

/**
 * Generates a clean SVG string for an otpauth URI using the qrcode library.
 */
export async function generateQrCodeSvg(otpauthUri: string): Promise<string> {
  return await QRCode.toString(otpauthUri, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
  });
}

/**
 * Step 052.1 & otplib integration helpers.
 */
export function otplibGenerateSecret(): string {
  return otplib.generateSecret();
}

export function otplibVerifyToken(params: { token: string; secret: string }): boolean {
  try {
    const result = otplib.verifySync({
      token: params.token.trim(),
      secret: params.secret.trim(),
    });
    return Boolean(result.valid);
  } catch {
    return false;
  }
}

/**
 * Encrypts a Base32 TOTP secret at rest using AES-256-GCM.
 * Step 052.2: Encrypted storage of TOTP secrets.
 */
export function encryptTotpSecret(secretBase32: string, userId: string): string {
  return encryptWithDomainKey('tokens', secretBase32, { context: userId });
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret.
 */
export function decryptTotpSecret(encryptedEnvelope: string, userId: string): string {
  return decryptWithDomainKey('tokens', encryptedEnvelope, { context: userId });
}

/**
 * Step 052.2: Initiates TOTP enrollment for a user:
 * - Generates 20-byte base32 secret
 * - Generates otpauth URI and QR code data URL
 * - Encrypts secret at rest with AES-256-GCM
 * - Stores pending enrollment in user_mfa with mfa_enabled = false
 */
export async function startUserTotpEnrollment(
  userId: string,
  email: string,
  options?: {
    readonly mfaRepo?: UserMfaRepository | undefined;
    readonly issuer?: string | undefined;
  }
): Promise<UserTotpSetupData> {
  const mfaRepo = options?.mfaRepo ?? defaultMfaRepo;
  const issuer = options?.issuer ?? 'KD SOLUTION IT';

  const secret = generateTotpSecret(20);
  const otpauthUri = generateOtpAuthUri(email, secret, issuer);
  const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUri);
  const encryptedSecret = encryptTotpSecret(secret, userId);

  // Persist pending enrollment in user_mfa
  await mfaRepo.upsertEnrollment(userId, encryptedSecret);

  logger.info('TOTP enrollment initiated for user', {
    userId,
    email,
  });

  return {
    secret,
    otpauthUri,
    qrCodeDataUrl,
    encryptedSecret,
  };
}

/**
 * Step 052.3: Validates user's first 6-digit TOTP code before enabling 2FA.
 * - Decrypts stored secret
 * - Verifies code with clock skew tolerance and replay defense
 * - Sets mfa_enabled = true in user_mfa
 * - Records immutable 2FA_ENROLLED audit log
 */
export async function verifyEnrollmentCode(
  userId: string,
  code: string,
  options?: {
    readonly mfaRepo?: UserMfaRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
    readonly timestamp?: number | undefined;
  }
): Promise<TotpVerifyResult> {
  const mfaRepo = options?.mfaRepo ?? defaultMfaRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const record = await mfaRepo.findByUserId(userId);
  if (!record) {
    logger.warn('TOTP verification rejected: no enrollment found', { userId });
    return {
      valid: false,
      error: 'No pending 2FA enrollment found for user',
    };
  }

  let plainSecret: string;
  try {
    plainSecret = decryptTotpSecret(record.totp_secret_encrypted, userId);
  } catch (err: unknown) {
    logger.error('Failed to decrypt TOTP secret for user', { userId, error: err });
    return {
      valid: false,
      error: 'Corrupted or unreadable TOTP security secret',
    };
  }

  const verifyResult = verifyTotp(code, plainSecret, {
    timestamp: options?.timestamp,
    lastUsedStep: record.last_used_step ?? undefined,
  });

  if (!verifyResult.valid) {
    logger.warn('TOTP enrollment code verification failed', {
      userId,
      error: verifyResult.error,
    });
    return verifyResult;
  }

  // Code is valid: activate 2FA
  await mfaRepo.enableMfa(userId, verifyResult.step);

  // Audit log entry
  const actorId = isUuid(userId) ? userId : null;
  await auditRepo.append({
    action: '2FA_ENROLLED',
    entity_type: 'user',
    entity_id: userId,
    actor_id: actorId,
    diff_payload: {
      before: { mfa_enabled: false },
      after: { mfa_enabled: true },
      changed_fields: ['mfa_enabled'],
    },
    payload: {
      userId,
      method: 'TOTP_RFC6238',
      step: verifyResult.step,
      enrolledAt: new Date().toISOString(),
    },
  });

  logger.info('TOTP 2FA successfully verified and enabled for user', {
    userId,
    step: verifyResult.step,
  });

  return verifyResult;
}

/**
 * Checks whether a given user has actively enabled 2FA.
 */
export async function isUser2faEnrolled(
  userId: string,
  options?: { readonly mfaRepo?: UserMfaRepository | undefined }
): Promise<boolean> {
  const mfaRepo = options?.mfaRepo ?? defaultMfaRepo;
  const record = await mfaRepo.findByUserId(userId);
  return record?.mfa_enabled === true;
}

/**
 * Step 052.4: Evaluates whether a user must be redirected to the mandatory 2FA enrollment flow.
 * In KD Solution IT, 2FA is strictly mandatory for every account role.
 */
export function evaluate2faRedirect(
  user: {
    readonly id: string;
    readonly mfa_enabled?: boolean | undefined;
    readonly is_staff?: boolean | undefined;
    readonly status?: string | undefined;
  },
  pathname: string
): { readonly shouldRedirect: boolean; readonly destination?: string | undefined } {
  // Public, static, authentication, or setup paths are exempt from redirect
  const exemptPrefixes = [
    '/auth/2fa/setup',
    '/api/auth/2fa',
    '/api/auth/logout',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/verify-email',
    '/login',
    '/register',
    '/verify-email',
    '/_next',
    '/favicon.ico',
  ];

  for (const prefix of exemptPrefixes) {
    if (pathname.startsWith(prefix)) {
      return { shouldRedirect: false };
    }
  }

  // If user has not completed 2FA enrollment, redirect to mandatory setup page
  if (!user.mfa_enabled) {
    return {
      shouldRedirect: true,
      destination: '/auth/2fa/setup',
    };
  }

  return { shouldRedirect: false };
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
