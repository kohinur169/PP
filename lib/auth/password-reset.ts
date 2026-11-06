// path: lib/auth/password-reset.ts

import crypto from 'node:crypto';
import { PasswordResetTokenRepository } from '../db/password-reset';
import { UserRepository } from '../db/users';
import { SessionRepository } from '../db/sessions';
import { AuditLogRepository } from '../db/audit';
import { hashPassword } from './password';
import { evaluatePasswordSecurity } from './pwned';
import { verifyTurnstileToken } from '../security/turnstile';
import { revokeAllSessions } from './session-kill';
import { logger } from '../logger';
import type { UserEntity } from '../../types/user';
import type {
  GeneratedResetToken,
  ForgotPasswordResult,
  ResetPasswordResult,
} from '../../types/password-reset';

export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour (3600 seconds)

const defaultResetRepo = new PasswordResetTokenRepository();
const defaultUserRepo = new UserRepository();
const defaultSessionRepo = new SessionRepository();
const defaultAuditRepo = new AuditLogRepository();

export interface PasswordResetDependencies {
  readonly resetRepo?: PasswordResetTokenRepository | undefined;
  readonly userRepo?: UserRepository | undefined;
  readonly sessionRepo?: SessionRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly baseUrl?: string | undefined;
  readonly nowMs?: number | undefined;
}

/**
 * Computes deterministic SHA-256 hex digest of a raw password reset token.
 * Plaintext tokens are NEVER stored in the database.
 */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Step 060.3 Lockout Immunity Guard:
 * Checks if a user account is under active brute-force or administrative lockout.
 */
export function isAccountLocked(user: UserEntity, currentTime: number = Date.now()): boolean {
  if (!user.locked_until) return false;
  const lockTime = new Date(user.locked_until).getTime();
  return lockTime > currentTime;
}

/**
 * Step 060.2: Initiates password reset flow (`POST /api/auth/forgot-password`).
 * - Validates Turnstile challenge token
 * - Anti-enumeration: returns generic confirmation regardless of email existence
 * - Step 060.3: Enforces lockout guard (refuses token creation if account is locked)
 * - Generates 1-hour secure token, hashes with SHA-256, stores in database
 * - Records AUTH_PASSWORD_RESET_REQUESTED audit log
 */
export async function requestPasswordReset(
  params: {
    readonly email: string;
    readonly turnstileToken?: string | undefined;
    readonly ipAddress?: string | undefined;
    readonly userAgent?: string | undefined;
  },
  options?: PasswordResetDependencies
): Promise<ForgotPasswordResult> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const resetRepo = options?.resetRepo ?? defaultResetRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const baseUrl = options?.baseUrl ?? 'https://kdsolution.it';
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const genericSuccessMessage =
    'If an account exists for this email address, password reset instructions have been sent.';

  // 1. Verify Cloudflare Turnstile token if supplied
  if (params.turnstileToken) {
    const turnstileResult = await verifyTurnstileToken(params.turnstileToken, {
      remoteIp: params.ipAddress,
    });
    if (!turnstileResult.success) {
      logger.warn('Password reset rejected: Turnstile verification failed', {
        email: params.email,
        ip: params.ipAddress,
      });
      return {
        success: false,
        message: 'Bot verification failed. Please try again.',
        tokenGenerated: false,
      };
    }
  }

  // 2. Lookup user by email
  const normalizedEmail = params.email.trim().toLowerCase();
  const user = await userRepo.findByEmail(normalizedEmail);

  // Anti-enumeration: if user doesn't exist, return generic message without revealing existence
  if (!user) {
    logger.info('Password reset requested for non-existent email', {
      emailPrefix: normalizedEmail.slice(0, 3) + '***',
    });
    return {
      success: true,
      message: genericSuccessMessage,
      tokenGenerated: false,
    };
  }

  // 3. Step 060.3 Lockout Immunity Guard:
  // If account is currently locked (locked_until > NOW()), refuse token creation!
  if (isAccountLocked(user, nowMs)) {
    logger.warn('Password reset request blocked: account is actively locked', {
      userId: user.id,
      lockedUntil: user.locked_until,
    });

    return {
      success: true,
      message: genericSuccessMessage,
      tokenGenerated: false,
      isLocked: true,
    };
  }

  // 4. Invalidate any prior pending tokens for this user
  await resetRepo.invalidatePendingForUser(user.id);

  // 5. Generate cryptographically secure 256-bit random reset token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(nowMs + RESET_TOKEN_EXPIRY_MS).toISOString();

  // 6. Persist token record in password_reset_tokens
  const record = await resetRepo.create({
    user_id: user.id,
    company_id: user.company_id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

  // 7. Emit audit log event
  try {
    await auditRepo.append({
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entity_type: 'user',
      entity_id: user.id,
      actor_id: user.id,
      company_id: user.company_id,
      ip_address: params.ipAddress ?? '127.0.0.1',
      user_agent: params.userAgent ?? 'Unknown User-Agent',
      payload: {
        userId: user.id,
        email: user.email,
        tokenId: record.id,
        expiresAt,
        requestedAt: nowIso,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append AUTH_PASSWORD_RESET_REQUESTED audit log entry', {
      userId: user.id,
      error: err,
    });
  }

  logger.info('Password reset token generated and dispatched', {
    userId: user.id,
    tokenId: record.id,
    expiresAt,
  });

  return {
    success: true,
    message: genericSuccessMessage,
    tokenGenerated: true,
    tokenId: record.id,
    rawToken,
    expiresAt,
  };
}

/**
 * Step 060.4: Completes password reset flow (`POST /api/auth/reset-password`).
 * - Validates reset token (hash match, not expired, not already used)
 * - Step 060.3 Lockout Immunity Guard: refuses reset if account is locked
 * - Validates new password strength (zxcvbn score >= 3, NIST rules, HIBP breach check)
 * - Updates user password hash with Argon2id
 * - Marks token as used
 * - Automatically revokes all existing sessions via `revokeAllSessions`
 * - Records AUTH_PASSWORD_RESET_COMPLETED audit log
 */
export async function executePasswordReset(
  params: {
    readonly token: string;
    readonly password: string;
    readonly turnstileToken?: string | undefined;
    readonly ipAddress?: string | undefined;
    readonly userAgent?: string | undefined;
  },
  options?: PasswordResetDependencies
): Promise<ResetPasswordResult> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const resetRepo = options?.resetRepo ?? defaultResetRepo;
  const sessionRepo = options?.sessionRepo ?? defaultSessionRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // 1. Verify Turnstile token if supplied
  if (params.turnstileToken) {
    const turnstileResult = await verifyTurnstileToken(params.turnstileToken, {
      remoteIp: params.ipAddress,
    });
    if (!turnstileResult.success) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Bot verification failed. Please try again.',
      };
    }
  }

  // 2. Validate token format
  if (!params.token || params.token.trim().length < 32) {
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Invalid or missing password reset token.',
    };
  }

  // 3. Find token in repository by SHA-256 hash
  const tokenHash = hashResetToken(params.token.trim());
  const tokenRecord = await resetRepo.findByTokenHash(tokenHash);

  if (!tokenRecord) {
    logger.warn('Password reset attempted with unknown token hash');
    return {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Password reset link is invalid or has already been used.',
    };
  }

  // Check if token was already consumed
  if (tokenRecord.used_at !== null) {
    logger.warn('Password reset attempted with already used token', {
      tokenId: tokenRecord.id,
      usedAt: tokenRecord.used_at,
    });
    return {
      success: false,
      error: 'TOKEN_ALREADY_USED',
      message: 'This password reset link has already been used. Please request a new one.',
    };
  }

  // Check if token is expired (>1 hour)
  const expiryTime = new Date(tokenRecord.expires_at).getTime();
  if (nowMs > expiryTime) {
    logger.warn('Password reset attempted with expired token', {
      tokenId: tokenRecord.id,
      expiresAt: tokenRecord.expires_at,
    });
    return {
      success: false,
      error: 'TOKEN_EXPIRED',
      message: 'This password reset link has expired. Password reset links are valid for 1 hour.',
    };
  }

  // 4. Retrieve user record
  const user = await userRepo.findById(tokenRecord.user_id);
  if (!user) {
    return {
      success: false,
      error: 'USER_NOT_FOUND',
      message: 'User account associated with this reset link was not found.',
    };
  }

  // 5. Step 060.3 Lockout Immunity Guard:
  // If account is currently locked, refuse token consumption!
  if (isAccountLocked(user, nowMs)) {
    logger.warn('Password reset redemption blocked: account is actively locked', {
      userId: user.id,
      lockedUntil: user.locked_until,
    });
    return {
      success: false,
      error: 'ACCOUNT_LOCKED',
      message:
        'Account is temporarily locked due to repeated failed login attempts. Password reset cannot circumvent an active security lockout.',
    };
  }

  // 6. Validate new password security & complexity
  const securityEvaluation = await evaluatePasswordSecurity(params.password);
  if (!securityEvaluation.valid) {
    logger.warn('Password reset rejected: weak or breached password', {
      userId: user.id,
      warning: securityEvaluation.complexity.warning,
      breached: securityEvaluation.breached,
    });
    return {
      success: false,
      error: securityEvaluation.breached ? 'PWNED_PASSWORD' : 'WEAK_PASSWORD',
      message:
        securityEvaluation.errorMessage ??
        'Password does not meet enterprise security complexity requirements.',
    };
  }

  // 7. Hash new password with Argon2id
  const newPasswordHash = await hashPassword(params.password);

  // 8. Update user password in repository
  await userRepo.updatePassword(user.id, user.version, newPasswordHash);

  // 9. Mark reset token as consumed
  await resetRepo.markUsed(tokenRecord.id, tokenRecord.version, nowIso);

  // 10. Step 060.4: Revoke all existing sessions across all devices
  await revokeAllSessions(user.id, {
    sessionRepo,
    auditRepo,
    reason: 'PASSWORD_RESET',
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  // 11. Emit audit log event
  try {
    await auditRepo.append({
      action: 'AUTH_PASSWORD_RESET_COMPLETED',
      entity_type: 'user',
      entity_id: user.id,
      actor_id: user.id,
      company_id: user.company_id,
      ip_address: params.ipAddress ?? '127.0.0.1',
      user_agent: params.userAgent ?? 'Unknown User-Agent',
      payload: {
        userId: user.id,
        email: user.email,
        tokenId: tokenRecord.id,
        resetCompletedAt: nowIso,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append AUTH_PASSWORD_RESET_COMPLETED audit log entry', {
      userId: user.id,
      error: err,
    });
  }

  logger.info('Password reset completed successfully; all user sessions terminated', {
    userId: user.id,
  });

  return {
    success: true,
    message:
      'Password has been successfully reset. All active sessions have been terminated. Please log in with your new password.',
    userId: user.id,
  };
}
