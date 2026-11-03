// path: lib/auth/session.ts
import crypto from 'node:crypto';
import type {
  UserSession,
  DeviceCharacteristics,
  SessionValidationResult,
  CreateSessionParams,
} from './session-types';
import {
  generateDeviceFingerprint,
  verifyDeviceFingerprint,
  hashSessionToken,
} from './fingerprint';
import { logger } from '@/lib/logger';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (LR-022 rolling inactivity)
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours (LR-022 hard ceiling)
export const MAX_CONCURRENT_SESSIONS = 5; // LR-022 concurrent session limit

// Fast memory store with persistence interface for active LR-022 sessions
const activeSessionsByTokenHash = new Map<string, UserSession>();
const activeSessionsById = new Map<string, UserSession>();

/**
 * Validates an active session record against LR-022 constraints:
 * 1. Explicit revocation check
 * 2. 8-hour absolute maximum lifetime
 * 3. 15-minute rolling idle timeout
 * 4. Ephemeral device fingerprint binding (subnet + User-Agent + headers)
 */
export function validateSessionRecord(
  session: UserSession,
  currentDevice: DeviceCharacteristics,
  currentTime: number = Date.now()
): SessionValidationResult {
  // 1. Explicit revocation check
  if (session.revokedAt) {
    return {
      valid: false,
      session,
      errorCode: 'REVOKED',
      message: `Session was revoked on ${session.revokedAt}. Reason: ${session.revocationReason ?? 'Unknown'}`,
    };
  }

  const createdTime = new Date(session.createdAt).getTime();
  const lastActiveTime = new Date(session.lastActiveAt).getTime();

  // 2. Absolute 8-hour maximum lifetime
  if (currentTime - createdTime >= ABSOLUTE_TIMEOUT_MS) {
    return {
      valid: false,
      session,
      errorCode: 'EXPIRED_ABSOLUTE',
      message: 'Session exceeded maximum 8-hour lifetime and must reauthenticate.',
    };
  }

  // 3. 15-minute rolling idle timeout
  if (currentTime - lastActiveTime >= IDLE_TIMEOUT_MS) {
    return {
      valid: false,
      session,
      errorCode: 'EXPIRED_IDLE',
      message: 'Session invalidated due to 15 minutes of inactivity (LR-022 idle timeout).',
    };
  }

  // 4. Ephemeral device fingerprint binding
  const fingerprintMatches = verifyDeviceFingerprint(
    currentDevice,
    session.deviceFingerprint
  );

  if (!fingerprintMatches) {
    logger.warn('LR-022 device fingerprint mismatch detected - session invalidated', {
      sessionId: session.id,
      userId: session.userId,
      recordedFingerprint: session.deviceFingerprint,
    });

    return {
      valid: false,
      session,
      errorCode: 'FINGERPRINT_MISMATCH',
      message:
        'Client network subnet or browser characteristics changed mid-session. Session revoked for security.',
    };
  }

  return {
    valid: true,
    session,
  };
}

/**
 * Enforces LR-022 concurrent session cap (max 5 active sessions per user).
 * If user already has 5 active sessions, the oldest active session is automatically revoked.
 */
export function enforceConcurrentSessionLimit(userId: string): number {
  const userSessions = getActiveSessionsForUser(userId).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let revokedCount = 0;

  while (userSessions.length >= MAX_CONCURRENT_SESSIONS) {
    const oldestSession = userSessions.shift();
    if (oldestSession) {
      revokeSession(oldestSession.id, 'CONCURRENT_LIMIT_EXCEEDED');
      revokedCount++;
    }
  }

  return revokedCount;
}

/**
 * Creates and registers a new LR-022 user session.
 */
export function createSession(params: CreateSessionParams): UserSession {
  // Enforce concurrent session limit before allocating new session
  enforceConcurrentSessionLimit(params.userId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS);

  const tokenHash = hashSessionToken(params.token);
  const fingerprint = generateDeviceFingerprint(params.device);
  const sessionId = crypto.randomUUID();

  const newSession: UserSession = {
    id: sessionId,
    userId: params.userId,
    tenantId: params.tenantId,
    sessionTokenHash: tokenHash,
    deviceFingerprint: fingerprint,
    ipAddress: params.device.ip,
    userAgent: params.device.userAgent,
    lastActiveAt: now.toISOString(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  activeSessionsByTokenHash.set(tokenHash, newSession);
  activeSessionsById.set(sessionId, newSession);

  logger.info('LR-022 session created successfully', {
    sessionId: newSession.id,
    userId: newSession.userId,
    tenantId: newSession.tenantId,
  });

  return newSession;
}

/**
 * Retrieves a session by its raw token and validates it against current device characteristics.
 */
export function getAndValidateSession(
  token: string,
  device: DeviceCharacteristics,
  currentTime: number = Date.now()
): SessionValidationResult {
  const tokenHash = hashSessionToken(token);
  const session = activeSessionsByTokenHash.get(tokenHash);

  if (!session) {
    return {
      valid: false,
      errorCode: 'NOT_FOUND',
      message: 'Session token not found or already terminated.',
    };
  }

  const result = validateSessionRecord(session, device, currentTime);

  if (!result.valid && result.errorCode && !session.revokedAt) {
    // Automatically mark as revoked in store with specific trigger reason
    revokeSession(session.id, result.errorCode);
  } else if (result.valid) {
    // Touch last active time
    touchSession(session.id, currentTime);
  }

  return result;
}

/**
 * Updates last_active_at on a valid session.
 */
export function touchSession(
  sessionId: string,
  currentTime: number = Date.now()
): UserSession | undefined {
  const session = activeSessionsById.get(sessionId);
  if (!session || session.revokedAt) return undefined;

  session.lastActiveAt = new Date(currentTime).toISOString();
  return session;
}

/**
 * Explicitly revokes a session by ID with an audit reason.
 */
export function revokeSession(sessionId: string, reason: string = 'USER_LOGOUT'): boolean {
  const session = activeSessionsById.get(sessionId);
  if (!session) return false;

  if (session.revokedAt) {
    // Preserve original revocation reason
    return true;
  }

  session.revokedAt = new Date().toISOString();
  session.revocationReason = reason;

  logger.info('LR-022 session revoked', {
    sessionId,
    userId: session.userId,
    reason,
  });

  return true;
}

/**
 * Revokes all active sessions for a user (e.g. password reset or global logout),
 * optionally preserving one active session.
 */
export function revokeAllUserSessions(
  userId: string,
  exceptSessionId?: string,
  reason: string = 'TERMINATE_ALL'
): number {
  let count = 0;
  for (const session of activeSessionsById.values()) {
    if (session.userId === userId && !session.revokedAt) {
      if (exceptSessionId && session.id === exceptSessionId) {
        continue;
      }
      session.revokedAt = new Date().toISOString();
      session.revocationReason = reason;
      count++;
    }
  }
  return count;
}

/**
 * Returns all active (non-revoked) sessions for a given user.
 */
export function getActiveSessionsForUser(userId: string): UserSession[] {
  const active: UserSession[] = [];
  for (const session of activeSessionsById.values()) {
    if (session.userId === userId && !session.revokedAt) {
      active.push(session);
    }
  }
  return active;
}

/**
 * Clears the in-memory session registry (used during testing).
 */
export function clearSessionRegistry(): void {
  activeSessionsByTokenHash.clear();
  activeSessionsById.clear();
}
