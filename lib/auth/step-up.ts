// path: lib/auth/step-up.ts
import crypto from 'node:crypto';
import type {
  SensitiveActionType,
  ReauthTicket,
  StepUpChallenge,
  StepUpGuardParams,
  StepUpGuardResult,
  StepUpAuthCheckResult,
} from './step-up-types';
import { SENSITIVE_ACTION_DESCRIPTIONS } from './step-up-types';
import { getActiveSessionById } from './session';
import { SessionRepository } from '../db/sessions';
import { UserRepository } from '../db/users';
import { UserMfaRepository } from '../db/mfa';
import { AuditLogRepository } from '../db/audit';
import { verifyPassword } from './password';
import { verifyTotp, decryptTotpSecret } from './totp';
import { logger } from '@/lib/logger';

export const REAUTH_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes (300 seconds)

// In-memory ticket registry for ephemeral reauthentication grants
const activeTickets = new Map<string, ReauthTicket>();

const defaultSessionRepo = new SessionRepository();
const defaultUserRepo = new UserRepository();
const defaultMfaRepo = new UserMfaRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Step 058.1: Evaluates whether a session's last_reauth_at timestamp is fresh (within maxAgeSeconds).
 * Returns stepUpRequired: true if reauthentication is missing, expired, or older than 300 seconds.
 */
export function requireStepUpAuth(
  session:
    | {
        last_reauth_at?: string | null | undefined;
        lastReauthAt?: string | null | undefined;
      }
    | null
    | undefined,
  maxAgeSeconds: number = 300,
  currentTime: number = Date.now()
): StepUpAuthCheckResult {
  if (!session) {
    return {
      stepUpRequired: true,
      lastReauthAt: null,
      secondsSinceReauth: null,
      maxAgeSeconds,
      message: 'No active session found. Step-up reauthentication is required.',
    };
  }

  const rawTimestamp = session.last_reauth_at ?? session.lastReauthAt;
  if (!rawTimestamp) {
    return {
      stepUpRequired: true,
      lastReauthAt: null,
      secondsSinceReauth: null,
      maxAgeSeconds,
      message: `Step-up reauthentication required. No previous verification found within ${maxAgeSeconds} seconds.`,
    };
  }

  const lastReauthMs = new Date(rawTimestamp).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((currentTime - lastReauthMs) / 1000));

  if (elapsedSeconds > maxAgeSeconds) {
    return {
      stepUpRequired: true,
      lastReauthAt: rawTimestamp,
      secondsSinceReauth: elapsedSeconds,
      maxAgeSeconds,
      message: `Step-up reauthentication expired (${elapsedSeconds}s > ${maxAgeSeconds}s limit). Fresh credentials required.`,
    };
  }

  return {
    stepUpRequired: false,
    lastReauthAt: rawTimestamp,
    secondsSinceReauth: elapsedSeconds,
    maxAgeSeconds,
  };
}

/**
 * Step 058.3: Updates last_reauth_at on a session in memory and in the database repository.
 */
export async function updateSessionReauthTimestamp(
  sessionId: string,
  timestamp: string = new Date().toISOString(),
  options?: { readonly sessionRepo?: SessionRepository | undefined }
): Promise<string> {
  const sessionRepo = options?.sessionRepo ?? defaultSessionRepo;

  // 1. Update in-memory session record
  const inMemory = getActiveSessionById(sessionId);
  if (inMemory) {
    inMemory.last_reauth_at = timestamp;
    inMemory.lastReauthAt = timestamp;
  }

  // 2. Persist to database repository
  await sessionRepo.updateReauthTimestamp(sessionId, timestamp);

  return timestamp;
}

export interface ExecuteStepUpOptions {
  readonly userRepo?: UserRepository | undefined;
  readonly mfaRepo?: UserMfaRepository | undefined;
  readonly sessionRepo?: SessionRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly nowMs?: number | undefined;
}

export interface ExecuteStepUpResult {
  readonly success: boolean;
  readonly ticket?: ReauthTicket | undefined;
  readonly lastReauthAt?: string | undefined;
  readonly error?: 'INVALID_CREDENTIALS' | 'INVALID_TOTP' | 'USER_NOT_FOUND' | 'NO_METHOD_SUPPLIED' | undefined;
  readonly message: string;
}

/**
 * Step 058.3: Validates candidate password or 2FA TOTP code for step-up reauthentication,
 * issues a 5-minute ReauthTicket, updates last_reauth_at, and writes an audit event.
 */
export async function executeStepUpVerification(
  params: {
    readonly userId: string;
    readonly sessionId?: string | undefined;
    readonly password?: string | undefined;
    readonly totpCode?: string | undefined;
    readonly action?: SensitiveActionType | undefined;
    readonly ipAddress?: string | undefined;
    readonly userAgent?: string | undefined;
  },
  options?: ExecuteStepUpOptions
): Promise<ExecuteStepUpResult> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const mfaRepo = options?.mfaRepo ?? defaultMfaRepo;
  const sessionRepo = options?.sessionRepo ?? defaultSessionRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const user = await userRepo.findById(params.userId);
  if (!user) {
    return {
      success: false,
      error: 'USER_NOT_FOUND',
      message: 'User account not found.',
    };
  }

  let verifiedMethod: 'PASSWORD' | 'TOTP' | null = null;

  // 1. Validate Password if supplied
  if (params.password && params.password.trim().length > 0) {
    const passwordMatch = await verifyPassword(params.password, user.password_hash);
    if (!passwordMatch) {
      return {
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid password supplied for step-up reauthentication.',
      };
    }
    verifiedMethod = 'PASSWORD';
  }

  // 2. Validate TOTP 2FA if supplied
  if (params.totpCode && params.totpCode.trim().length > 0) {
    const mfaRecord = await mfaRepo.findByUserId(params.userId);
    if (!mfaRecord || !mfaRecord.totp_secret_encrypted || !mfaRecord.mfa_enabled) {
      return {
        success: false,
        error: 'INVALID_TOTP',
        message: 'Two-factor authentication is not enrolled on this account.',
      };
    }

    let plainSecret: string;
    try {
      plainSecret = decryptTotpSecret(mfaRecord.totp_secret_encrypted, params.userId);
    } catch {
      plainSecret = mfaRecord.totp_secret_encrypted;
    }

    const totpValid = verifyTotp(params.totpCode, plainSecret, {
      lastUsedStep: mfaRecord.last_used_step ?? undefined,
    });
    if (!totpValid.valid) {
      return {
        success: false,
        error: 'INVALID_TOTP',
        message: totpValid.error ?? 'Invalid or expired two-factor authentication code.',
      };
    }
    if (totpValid.step !== undefined) {
      await mfaRepo.updateLastUsedStep(params.userId, totpValid.step);
    }
    verifiedMethod = 'TOTP';
  }

  if (!verifiedMethod) {
    return {
      success: false,
      error: 'NO_METHOD_SUPPLIED',
      message: 'Please provide either password or 2FA one-time code.',
    };
  }

  // 3. Issue fresh 5-minute ReauthTicket
  const action = params.action ?? 'UPDATE_GATEWAY_KEYS';
  const ticket = issueStepUpTicket(params.userId, action, REAUTH_GRACE_PERIOD_MS);

  // 4. Update session last_reauth_at timestamp
  if (params.sessionId) {
    await updateSessionReauthTimestamp(params.sessionId, nowIso, { sessionRepo });
  }

  // 5. Emit security audit event
  await auditRepo.append({
    action: 'STEP_UP_REAUTH_PASSED',
    entity_type: 'user',
    entity_id: params.userId,
    actor_id: params.userId,
    company_id: user.company_id,
    ip_address: params.ipAddress ?? '127.0.0.1',
    user_agent: params.userAgent ?? 'Unknown User-Agent',
    payload: {
      ticketId: ticket.id,
      action,
      verifiedMethod,
      verifiedAt: nowIso,
      expiresAt: ticket.expiresAt,
    },
  });

  return {
    success: true,
    ticket,
    lastReauthAt: nowIso,
    message: 'Step-up reauthentication succeeded.',
  };
}

/**
 * Issues an ephemeral reauthentication ticket valid for exactly 5 minutes (300 seconds).
 */
export function issueStepUpTicket(
  userId: string,
  action: SensitiveActionType,
  validForMs: number = REAUTH_GRACE_PERIOD_MS
): ReauthTicket {
  const now = Date.now();
  const ticketId = `ticket_${crypto.randomUUID()}`;
  const nonce = crypto.randomBytes(16).toString('hex');

  const ticket: ReauthTicket = {
    id: ticketId,
    userId,
    action,
    verifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + validForMs).toISOString(),
    nonce,
  };

  activeTickets.set(ticketId, ticket);

  logger.info('Step-up reauthentication ticket issued', {
    ticketId,
    userId,
    action,
    validForSeconds: validForMs / 1000,
  });

  return ticket;
}

/**
 * Validates whether an active ticket is valid, matching the requested user and action,
 * and within the 5-minute validity window.
 */
export function verifyStepUpTicket(
  ticketId: string,
  userId: string,
  action: SensitiveActionType,
  currentTime: number = Date.now()
): boolean {
  if (!ticketId) return false;

  const ticket = activeTickets.get(ticketId);
  if (!ticket) return false;

  // Verify ownership
  if (ticket.userId !== userId) {
    logger.warn('Step-up ticket user mismatch', {
      ticketUserId: ticket.userId,
      requestUserId: userId,
    });
    return false;
  }

  // Verify action scope (e.g. payout ticket cannot be used for API key revocation)
  if (ticket.action !== action) {
    logger.warn('Step-up ticket action scope mismatch', {
      ticketAction: ticket.action,
      requestedAction: action,
    });
    return false;
  }

  // Verify 5-minute expiration
  const expiryTime = new Date(ticket.expiresAt).getTime();
  if (currentTime > expiryTime) {
    logger.warn('Step-up ticket expired (>5 minutes)', { ticketId, action });
    activeTickets.delete(ticketId);
    return false;
  }

  return true;
}

/**
 * Consumes and invalidates a step-up ticket, ensuring one-time execution per sensitive action.
 */
export function consumeStepUpTicket(
  ticketId: string,
  userId: string,
  action: SensitiveActionType,
  currentTime: number = Date.now()
): boolean {
  const isValid = verifyStepUpTicket(ticketId, userId, action, currentTime);
  if (!isValid) return false;

  activeTickets.delete(ticketId);
  logger.info('Step-up ticket consumed successfully', { ticketId, userId, action });
  return true;
}

/**
 * Creates a standard Step-Up Challenge descriptor when sensitive action gating is triggered.
 */
export function createStepUpChallenge(action: SensitiveActionType): StepUpChallenge {
  const description = SENSITIVE_ACTION_DESCRIPTIONS[action] ?? action;
  return {
    challengeRequired: true,
    action,
    description,
    challengeType: 'PASSWORD',
    message: `Step-up reauthentication required to perform sensitive operation: ${description}. Please provide password or 2FA credentials.`,
  };
}

/**
 * Server action and API middleware wrapper that intercepts sensitive operations.
 * Requires a valid, non-expired step-up ticket before executing the protected handler.
 */
export async function withStepUpGuard<T>(
  params: StepUpGuardParams,
  handler: () => Promise<T>,
  currentTime: number = Date.now()
): Promise<StepUpGuardResult<T>> {
  if (!params.ticketId) {
    logger.info('Sensitive action invoked without step-up ticket - challenge issued', {
      action: params.action,
      userId: params.userId,
    });

    const challenge = createStepUpChallenge(params.action);
    return {
      success: false,
      challengeRequired: true,
      action: params.action,
      message: challenge.message,
    };
  }

  const isTicketValid = consumeStepUpTicket(
    params.ticketId,
    params.userId,
    params.action,
    currentTime
  );

  if (!isTicketValid) {
    logger.warn('Sensitive action invoked with invalid or expired ticket - challenge issued', {
      action: params.action,
      userId: params.userId,
      ticketId: params.ticketId,
    });

    const challenge = createStepUpChallenge(params.action);
    return {
      success: false,
      challengeRequired: true,
      action: params.action,
      message: challenge.message,
    };
  }

  // Ticket valid and consumed: execute protected sensitive handler
  const result = await handler();
  return {
    success: true,
    data: result,
  };
}

/**
 * Clears active ticket cache (for unit testing isolation).
 */
export function clearStepUpRegistry(): void {
  activeTickets.clear();
}
