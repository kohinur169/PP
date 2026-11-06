// path: lib/auth/email-verify.ts

import crypto from 'node:crypto';
import { logger } from '../logger';
import { EmailVerificationTokenRepository } from '../db/email-verify';
import { UserRepository } from '../db/users';
import { AuditLogRepository } from '../db/audit';
import type {
  GeneratedVerificationToken,
  VerifyEmailResult,
} from '../../types/email-verify';

/**
 * Default repository singletons for runtime execution.
 */
const defaultTokenRepo = new EmailVerificationTokenRepository();
const defaultUserRepo = new UserRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Options for email verification token generation.
 */
export interface GenerateTokenOptions {
  readonly baseUrl?: string | undefined;
  readonly tokenRepo?: EmailVerificationTokenRepository | undefined;
  readonly userRepo?: UserRepository | undefined;
  readonly expiresInHours?: number | undefined;
}

/**
 * Options for email verification token redemption.
 */
export interface VerifyTokenOptions {
  readonly tokenRepo?: EmailVerificationTokenRepository | undefined;
  readonly userRepo?: UserRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

/**
 * Computes a deterministic SHA-256 hex digest of a raw verification token.
 * Plaintext tokens are NEVER stored in the database.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Step 048.2: Generates a cryptographically secure 256-bit random verification token
 * with a 24-hour expiration window.
 *
 * @param userId - UUID of the user requiring verification
 * @param options - Configurable base URL, repository injection, and expiration duration
 * @returns Generated token details including raw one-time URL and stored hash
 */
export async function generateEmailVerificationToken(
  userId: string,
  options?: GenerateTokenOptions
): Promise<GeneratedVerificationToken> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid user ID is required to generate verification token.');
  }

  const tokenRepo = options?.tokenRepo ?? defaultTokenRepo;
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const expiresInHours = options?.expiresInHours ?? 24;

  // 1. Verify user existence
  const user = await userRepo.findById(userId);
  if (!user) {
    throw new Error(`User not found with ID: ${userId}`);
  }

  // 2. Generate 256-bit (32 bytes) cryptographically secure random token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  // 3. Compute 24-hour expiration timestamp
  const expiresAt = new Date(
    Date.now() + expiresInHours * 60 * 60 * 1000
  ).toISOString();

  // 4. Invalidate any previous unconsumed tokens for this user
  await tokenRepo.invalidatePendingTokensForUser(userId);

  // 5. Persist SHA-256 token hash to database
  const record = await tokenRepo.createToken({
    userId,
    tokenHash,
    expiresAt,
    companyId: user.company_id,
  });

  // 6. Build verification URL
  const baseUrl =
    options?.baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://app.kdsolution.it';

  const verificationUrl = `${baseUrl.replace(/\/+$/, '')}/api/auth/verify-email?token=${encodeURIComponent(
    rawToken
  )}`;

  logger.info('Email verification token generated', {
    userId,
    tokenId: record.id,
    expiresAt,
  });

  return {
    tokenId: record.id,
    rawToken,
    tokenHash,
    expiresAt,
    verificationUrl,
  };
}

/**
 * Step 048.3: Verifies candidate token hash, activates user account,
 * and marks token used. Rejects expired or previously redeemed tokens.
 *
 * @param rawToken - Plaintext one-time token received from verification link
 * @param options - Configurable repository injection for test isolation
 * @returns Verification result including activation status
 */
export async function verifyEmailToken(
  rawToken: string,
  options?: VerifyTokenOptions
): Promise<VerifyEmailResult> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 32) {
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Verification token format is invalid.',
    };
  }

  const tokenRepo = options?.tokenRepo ?? defaultTokenRepo;
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const candidateHash = hashToken(rawToken.trim());

  // 1. Locate token record by SHA-256 hash
  const record = await tokenRepo.findByTokenHash(candidateHash);
  if (!record) {
    logger.warn('Email verification attempted with unknown token hash', {
      hashPrefix: candidateHash.slice(0, 8),
    });
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Verification token is invalid or does not exist.',
    };
  }

  // 2. Reject already consumed tokens
  if (record.used_at !== null) {
    logger.warn('Email verification attempted with already consumed token', {
      tokenId: record.id,
      userId: record.user_id,
      usedAt: record.used_at,
    });
    return {
      success: false,
      error: 'TOKEN_ALREADY_USED',
      message: 'Verification token has already been used.',
    };
  }

  // 3. Reject expired tokens
  const expiresAtMs = new Date(record.expires_at).getTime();
  if (expiresAtMs <= Date.now()) {
    logger.warn('Email verification attempted with expired token', {
      tokenId: record.id,
      userId: record.user_id,
      expiresAt: record.expires_at,
    });
    return {
      success: false,
      error: 'TOKEN_EXPIRED',
      message: 'Verification token has expired. Please request a new verification link.',
    };
  }

  // 4. Locate and validate associated user
  const user = await userRepo.findById(record.user_id);
  if (!user) {
    logger.error('Email verification target user not found', {
      userId: record.user_id,
      tokenId: record.id,
    });
    return {
      success: false,
      error: 'USER_NOT_FOUND',
      message: 'Associated user account was not found.',
    };
  }

  const nowIso = new Date().toISOString();

  // 5. Mark token as consumed
  await tokenRepo.markUsed(record.id, record.version);

  // 6. Transition user status from pending_verification to active
  const previousStatus = user.status;
  await userRepo.update(user.id, user.version, {
    status: 'active',
    email_verified_at: nowIso,
  });

  // 7. Write tamper-evident audit log
  await auditRepo.append({
    company_id: user.company_id,
    actor_id: user.id,
    action: 'EMAIL_VERIFIED',
    entity_type: 'user',
    entity_id: user.id,
    diff_payload: {
      before: {
        status: previousStatus,
        email_verified_at: user.email_verified_at ?? null,
      },
      after: {
        status: 'active',
        email_verified_at: nowIso,
      },
      changed_fields: ['status', 'email_verified_at'],
    },
    payload: {
      tokenId: record.id,
      verificationMechanism: 'sha256_high_entropy_token',
      verifiedAt: nowIso,
    },
  });

  logger.info('Email verified successfully, user account activated', {
    userId: user.id,
    email: user.email,
    previousStatus,
    newStatus: 'active',
  });

  return {
    success: true,
    userId: user.id,
    email: user.email,
    message: 'Email verified successfully. Your account is now active.',
  };
}
