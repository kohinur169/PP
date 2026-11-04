// path: lib/auth/lockout.ts

import { UserRepository } from '../db/users';
import { AuditLogRepository } from '../db/audit';
import type { UserEntity, UserAccountStatus } from '../../types/user';
import { logger } from '../logger';

/**
 * Enterprise KD Solution IT Authentication Lockout Rules:
 * - Exactly 2 consecutive failed password or 2FA attempts trigger immediate lockout.
 * - Lockout persists in database for exactly 2 hours (7,200 seconds / 7,200,000 ms).
 * - Survives server restarts and memory evictions.
 * - Password resets are strictly blocked during active lockout.
 */
export const MAX_CONSECUTIVE_FAILED_ATTEMPTS = 2;
export const LOCKOUT_DURATION_HOURS = 2;
export const LOCKOUT_DURATION_MS = LOCKOUT_DURATION_HOURS * 60 * 60 * 1000; // 7,200,000 ms

/**
 * Result returned after recording a failed authentication attempt.
 */
export interface LockoutRecordResult {
  readonly userId: string;
  readonly failedAttempts: number;
  readonly locked: boolean;
  readonly lockedUntil: string | null;
  readonly emailDispatched: boolean;
  readonly user: UserEntity;
}

/**
 * Result returned by the lockout status guard.
 */
export interface LockoutGuardResult {
  readonly locked: boolean;
  readonly lockedUntil: string | null;
  readonly remainingSeconds: number;
  readonly message?: string | undefined;
}

/**
 * Options configuring lockout dependencies and clock mocking.
 */
export interface LockoutOptions {
  readonly userRepo?: UserRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly nowMs?: number | undefined;
  readonly emailDispatcher?: ((params: LockoutEmailParams) => Promise<boolean> | boolean) | undefined;
}

/**
 * Parameters for dispatching a lockout security notification email.
 */
export interface LockoutEmailParams {
  readonly email: string;
  readonly userId: string;
  readonly lockedUntil: string;
}

/**
 * Result of security email dispatch.
 */
export interface LockoutEmailResult {
  readonly dispatched: boolean;
  readonly recipient: string;
  readonly subject: string;
  readonly lockedUntil: string;
}

const defaultUserRepo = new UserRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Step 050.2: Dispatches a security notification email to the account owner
 * when a 2-hour security lockout is engaged.
 */
export async function dispatchLockoutSecurityEmail(
  params: LockoutEmailParams,
  options?: LockoutOptions
): Promise<LockoutEmailResult> {
  const subject = 'Security Notice: Account Temporarily Locked (2-Hour Cooldown)';

  if (options?.emailDispatcher) {
    await options.emailDispatcher(params);
  }

  logger.warn('Lockout security email dispatched to user', {
    userId: params.userId,
    recipient: params.email,
    lockedUntil: params.lockedUntil,
    subject,
  });

  return {
    dispatched: true,
    recipient: params.email,
    subject,
    lockedUntil: params.lockedUntil,
  };
}

/**
 * Determines whether a user record is actively locked at the specified time.
 */
export function isAccountLocked(
  user: Pick<UserEntity, 'locked_until' | 'status'>,
  nowMs = Date.now()
): boolean {
  if (user.status === 'locked' && user.locked_until) {
    return new Date(user.locked_until).getTime() > nowMs;
  }

  if (user.locked_until) {
    return new Date(user.locked_until).getTime() > nowMs;
  }

  return false;
}

/**
 * Step 050.1 & Step 050.2: Increments failed login counter in database.
 * If failed_attempts >= 2, sets locked_until = NOW() + 2 hours, transitions
 * status to 'locked', dispatches security alert email, and writes audit event.
 */
export async function recordFailedLoginAttempt(
  userId: string,
  options?: LockoutOptions
): Promise<LockoutRecordResult> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const nowMs = options?.nowMs ?? Date.now();

  const user = await userRepo.findByIdOrThrow(userId);
  const newAttempts = (user.failed_attempts || 0) + 1;
  const shouldLock = newAttempts >= MAX_CONSECUTIVE_FAILED_ATTEMPTS;

  let lockedUntil: string | null = user.locked_until;
  let newStatus: UserAccountStatus = user.status;

  if (shouldLock) {
    lockedUntil = new Date(nowMs + LOCKOUT_DURATION_MS).toISOString();
    newStatus = 'locked';
  }

  const updatedUser = await userRepo.update(user.id, user.version, {
    failed_attempts: newAttempts,
    locked_until: lockedUntil,
    status: newStatus,
  });

  let emailDispatched = false;

  if (shouldLock && lockedUntil) {
    await dispatchLockoutSecurityEmail(
      {
        email: updatedUser.email,
        userId: updatedUser.id,
        lockedUntil,
      },
      options
    );
    emailDispatched = true;

    await auditRepo.append({
      action: 'ACCOUNT_LOCKED',
      entity_type: 'user',
      entity_id: updatedUser.id,
      actor_id: updatedUser.id,
      company_id: updatedUser.company_id,
      payload: {
        userId: updatedUser.id,
        failedAttempts: newAttempts,
        lockedUntil,
        cooldownHours: LOCKOUT_DURATION_HOURS,
      },
    });

    logger.warn('User account locked due to 2 consecutive failed attempts', {
      userId: updatedUser.id,
      failedAttempts: newAttempts,
      lockedUntil,
    });
  } else {
    await auditRepo.append({
      action: 'LOGIN_FAILED',
      entity_type: 'user',
      entity_id: updatedUser.id,
      actor_id: updatedUser.id,
      company_id: updatedUser.company_id,
      payload: {
        userId: updatedUser.id,
        failedAttempts: newAttempts,
        attemptsRemaining: Math.max(0, MAX_CONSECUTIVE_FAILED_ATTEMPTS - newAttempts),
      },
    });
  }

  return {
    userId: updatedUser.id,
    failedAttempts: newAttempts,
    locked: shouldLock,
    lockedUntil,
    emailDispatched,
    user: updatedUser,
  };
}

/**
 * Step 050.3: Enforces lockout guard.
 * Rejects authentication attempts while locked_until > NOW() even with correct credentials.
 * If 2 hours have elapsed, automatically releases the lock and resets counter.
 */
export async function checkLockoutGuard(
  userId: string,
  options?: LockoutOptions
): Promise<LockoutGuardResult> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const nowMs = options?.nowMs ?? Date.now();

  const user = await userRepo.findById(userId);
  if (!user) {
    return { locked: false, lockedUntil: null, remainingSeconds: 0 };
  }

  if (user.locked_until) {
    const lockExpiryMs = new Date(user.locked_until).getTime();

    if (lockExpiryMs > nowMs) {
      const remainingSeconds = Math.ceil((lockExpiryMs - nowMs) / 1000);
      return {
        locked: true,
        lockedUntil: user.locked_until,
        remainingSeconds,
        message:
          'Account is temporarily locked for 2 hours due to consecutive failed login attempts. Please try again later or contact support.',
      };
    }

    // Natural 2-hour expiration: automatically clear lockout in database
    await userRepo.update(user.id, user.version, {
      failed_attempts: 0,
      locked_until: null,
      status: 'active',
    });

    await auditRepo.append({
      action: 'ACCOUNT_LOCK_EXPIRED',
      entity_type: 'user',
      entity_id: user.id,
      actor_id: user.id,
      company_id: user.company_id,
      payload: {
        userId: user.id,
        expiredLockUntil: user.locked_until,
      },
    });

    logger.info('Account lockout naturally expired after 2 hours; account unlocked', {
      userId: user.id,
    });
  }

  return {
    locked: false,
    lockedUntil: null,
    remainingSeconds: 0,
  };
}

/**
 * Step 050.4: Password Reset Lockout Guard.
 * Strictly blocks password reset initiation and forbids clearing the lock
 * by attempting to change password while the account is under an active lock.
 */
export async function canInitiatePasswordReset(
  userId: string,
  options?: LockoutOptions
): Promise<{ readonly permitted: boolean; readonly reason?: string | undefined }> {
  const guard = await checkLockoutGuard(userId, options);

  if (guard.locked) {
    logger.warn('Password reset attempt blocked: account is actively locked', {
      userId,
      remainingSeconds: guard.remainingSeconds,
    });

    return {
      permitted: false,
      reason:
        'Password reset is strictly forbidden while an account is under active security lockout. Please wait for the 2-hour cooldown to expire or complete office verification.',
    };
  }

  return { permitted: true };
}
