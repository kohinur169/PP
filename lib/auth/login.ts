// path: lib/auth/login.ts

import crypto from 'node:crypto';
import { verifyPassword } from './password';
import { createSession } from './session';
import type { DeviceCharacteristics, UserSession } from './session-types';
import { UserRepository } from '../db/users';
import { AuditLogRepository } from '../db/audit';
import type { UserEntity, UserAccountStatus } from '../../types/user';
import { logger } from '../logger';

/**
 * Precomputed, authentic Argon2id hash used to perform dummy key derivation
 * when an authentication attempt targets a non-existent email address.
 * Matches OWASP recommended Argon2id parameters (m=65536, t=3, p=4) to ensure
 * indistinguishable execution latency (<20ms variance) and defeat account enumeration.
 */
export const DUMMY_ARGON2ID_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$uz8QuZg8i1DmzdJY/7HZDQ$xvJNg4ntv+cIelYa2ZcotSFTw9VUUQMGQAI5crhc+kQ';

/**
 * Standard generic error message returned for both missing accounts and invalid passwords
 * to prevent user enumeration.
 */
export const GENERIC_AUTH_ERROR_MESSAGE = 'Invalid email address or password.';

/**
 * Options configuring authentication behavior and repository dependencies.
 */
export interface AuthenticateUserOptions {
  readonly userRepo?: UserRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

/**
 * Credentials payload supplied for authentication.
 */
export interface AuthenticateCredentials {
  readonly email: string;
  readonly password: string;
  readonly device: DeviceCharacteristics;
}

/**
 * Result returned by the authentication pipeline.
 */
export interface AuthenticationResult {
  readonly success: boolean;
  readonly message: string;
  readonly error?:
    | 'INVALID_CREDENTIALS'
    | 'ACCOUNT_LOCKED'
    | 'EMAIL_NOT_VERIFIED'
    | 'ACCOUNT_SUSPENDED'
    | undefined;
  readonly session?: UserSession | undefined;
  readonly sessionToken?: string | undefined;
  readonly user?: UserEntity | undefined;
  readonly mfaRequired?: boolean | undefined;
  readonly timingDurationMs?: number | undefined;
}

const defaultUserRepo = new UserRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Step 049.2: Constant-Time Anti-Enumeration Authentication Flow.
 * Executes dummy Argon2id verification if user record is not found, ensuring
 * indistinguishable server response times between valid and non-existent accounts.
 */
export async function authenticateUser(
  credentials: AuthenticateCredentials,
  options?: AuthenticateUserOptions
): Promise<AuthenticationResult> {
  const startTime = Date.now();
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const normalizedEmail = (credentials.email || '').trim().toLowerCase();
  const candidatePassword = credentials.password || '';

  // 1. Locate user record by email
  const user = await userRepo.findByEmail(normalizedEmail);

  // 2. Case A: User does NOT exist in database
  if (!user) {
    // Execute dummy Argon2id verification to burn identical CPU/memory cycles
    await verifyPassword(candidatePassword, DUMMY_ARGON2ID_HASH);

    const duration = Date.now() - startTime;
    logger.warn('Authentication failed: unknown email identity', {
      emailPrefix: normalizedEmail.slice(0, 3) + '***',
      durationMs: duration,
      ip: credentials.device.ip,
    });

    // Record audit event for non-existent user attempt
    await auditRepo.append({
      action: 'LOGIN_FAILED',
      entity_type: 'user',
      entity_id: null,
      actor_id: null,
      company_id: '00000000-0000-7000-8000-000000000000',
      ip_address: credentials.device.ip,
      user_agent: credentials.device.userAgent,
      payload: {
        reason: 'ACCOUNT_NOT_FOUND',
        attemptedEmailPrefix: normalizedEmail.slice(0, 3),
      },
    });

    return {
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: GENERIC_AUTH_ERROR_MESSAGE,
      timingDurationMs: duration,
    };
  }

  // 3. Case B: User exists - check if account is currently locked
  const isLocked =
    (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) ||
    user.status === 'locked';

  if (isLocked) {
    // Run dummy Argon2id to equalize response time even when locked
    await verifyPassword(candidatePassword, DUMMY_ARGON2ID_HASH);

    const duration = Date.now() - startTime;
    logger.warn('Authentication rejected: account is actively locked', {
      userId: user.id,
      lockedUntil: user.locked_until,
      durationMs: duration,
    });

    await auditRepo.append({
      action: 'LOGIN_LOCKED_ATTEMPT',
      entity_type: 'user',
      entity_id: user.id,
      actor_id: user.id,
      company_id: user.company_id,
      ip_address: credentials.device.ip,
      user_agent: credentials.device.userAgent,
      payload: {
        userId: user.id,
        lockedUntil: user.locked_until,
      },
    });

    return {
      success: false,
      error: 'ACCOUNT_LOCKED',
      message:
        'Account is temporarily locked due to consecutive failed login attempts. Please try again later.',
      timingDurationMs: duration,
    };
  }

  // 4. Verify candidate password against real Argon2id password hash
  const passwordMatch = await verifyPassword(candidatePassword, user.password_hash);

  // 5. Case C: Password mismatch for existing user
  if (!passwordMatch) {
    const failedAttempts = (user.failed_attempts || 0) + 1;
    const shouldLock = failedAttempts >= 2; // Step 050: 2 consecutive failed attempts = 2h lock

    let lockedUntil: string | null = null;
    let newStatus: UserAccountStatus = user.status;

    if (shouldLock) {
      lockedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      newStatus = 'locked';
    }

    await userRepo.update(user.id, user.version, {
      failed_attempts: failedAttempts,
      locked_until: lockedUntil,
      status: newStatus,
    });

    const duration = Date.now() - startTime;
    logger.warn('Authentication failed: incorrect password', {
      userId: user.id,
      failedAttempts,
      locked: shouldLock,
      durationMs: duration,
    });

    await auditRepo.append({
      action: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      entity_type: 'user',
      entity_id: user.id,
      actor_id: user.id,
      company_id: user.company_id,
      ip_address: credentials.device.ip,
      user_agent: credentials.device.userAgent,
      payload: {
        userId: user.id,
        failedAttempts,
        locked: shouldLock,
        lockedUntil,
      },
    });

    return {
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: GENERIC_AUTH_ERROR_MESSAGE,
      timingDurationMs: duration,
    };
  }

  // 6. Case D: Password verified - check email activation status
  if (user.status === 'pending_verification') {
    const duration = Date.now() - startTime;
    logger.warn('Authentication blocked: email verification pending', {
      userId: user.id,
      status: user.status,
    });

    return {
      success: false,
      error: 'EMAIL_NOT_VERIFIED',
      message:
        'Please verify your email address before logging in. Check your inbox for the activation link.',
      timingDurationMs: duration,
    };
  }

  // 7. Case E: Check for suspended accounts
  if (user.status === 'suspended') {
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: 'ACCOUNT_SUSPENDED',
      message: 'Account has been suspended. Please contact customer support.',
      timingDurationMs: duration,
    };
  }

  // 8. Successful authentication: reset failed attempts
  if (user.failed_attempts > 0 || user.locked_until !== null) {
    await userRepo.update(user.id, user.version, {
      failed_attempts: 0,
      locked_until: null,
    });
  }

  // 9. Generate high-entropy 256-bit session token and register LR-022 session
  const rawSessionToken = crypto.randomBytes(32).toString('hex');
  const session = createSession({
    token: rawSessionToken,
    userId: user.id,
    tenantId: user.company_id,
    device: credentials.device,
  });

  const duration = Date.now() - startTime;
  logger.info('User authenticated successfully', {
    userId: user.id,
    sessionId: session.id,
    durationMs: duration,
  });

  await auditRepo.append({
    action: 'LOGIN_SUCCESS',
    entity_type: 'user',
    entity_id: user.id,
    actor_id: user.id,
    company_id: user.company_id,
    ip_address: credentials.device.ip,
    user_agent: credentials.device.userAgent,
    payload: {
      userId: user.id,
      sessionId: session.id,
      authMethod: 'password_argon2id',
    },
  });

  return {
    success: true,
    message: 'Authentication successful.',
    session,
    sessionToken: rawSessionToken,
    user,
    timingDurationMs: duration,
  };
}
