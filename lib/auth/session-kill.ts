// path: lib/auth/session-kill.ts

import {
  revokeSession,
  revokeAllUserSessions,
  formatClearSessionCookieHeader,
  SESSION_COOKIE_NAME,
  getActiveSessionById,
} from './session';
import { SessionRepository } from '../db/sessions';
import { AuditLogRepository } from '../db/audit';
import { logger } from '@/lib/logger';

export interface SessionKillDependencies {
  readonly sessionRepo?: SessionRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly nowMs?: number | undefined;
}

export interface LogoutOptions extends SessionKillDependencies {
  readonly reason?: string | undefined;
  readonly userId?: string | undefined;
  readonly companyId?: string | undefined;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface LogoutResult {
  readonly success: boolean;
  readonly sessionId?: string | undefined;
  readonly clearCookieHeaders: string[];
  readonly message: string;
}

export interface RevokeAllOptions extends SessionKillDependencies {
  readonly reason?: string | undefined;
  readonly actorId?: string | undefined;
  readonly companyId?: string | undefined;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface RevokeAllResult {
  readonly success: boolean;
  readonly userId: string;
  readonly revokedCount: number;
  readonly clearCookieHeaders: string[];
  readonly revokedAt: string;
  readonly reason: string;
  readonly message: string;
}

const defaultSessionRepo = new SessionRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Returns canonical Set-Cookie header directives that wipe session cookies across all browser scopes.
 */
export function getSessionClearCookieHeaders(): string[] {
  return [
    formatClearSessionCookieHeader(SESSION_COOKIE_NAME),
    formatClearSessionCookieHeader(`__Host-${SESSION_COOKIE_NAME}`),
    formatClearSessionCookieHeader(`__Secure-${SESSION_COOKIE_NAME}`),
  ];
}

/**
 * Step 059.1: Single-session logout.
 * - Marks the session record as revoked in-memory (instant invalidation)
 * - Updates the session record in PostgreSQL database repository
 * - Generates expired Set-Cookie headers wiping the client cookie
 * - Appends immutable security audit log entry
 */
export async function logout(
  sessionId: string | null | undefined,
  options?: LogoutOptions
): Promise<LogoutResult> {
  const sessionRepo = options?.sessionRepo ?? defaultSessionRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const reason = options?.reason ?? 'USER_LOGOUT';
  const nowIso = new Date(options?.nowMs ?? Date.now()).toISOString();
  const clearCookieHeaders = getSessionClearCookieHeaders();

  if (!sessionId) {
    return {
      success: true,
      clearCookieHeaders,
      message: 'No active session supplied. Cookies cleared.',
    };
  }

  // 1. Invalidate in-memory session record
  const inMemorySession = getActiveSessionById(sessionId);
  const memoryRevoked = revokeSession(sessionId, reason);

  // 2. Invalidate database repository record
  let dbSession = await sessionRepo.findBySessionId(sessionId);
  if (!dbSession) {
    // Also try by primary key id if sessionId matches UUID
    dbSession = await sessionRepo.findById(sessionId);
  }

  let effectiveUserId = options?.userId ?? inMemorySession?.userId;
  let effectiveCompanyId = options?.companyId ?? inMemorySession?.tenantId;

  if (dbSession) {
    effectiveUserId = effectiveUserId ?? dbSession.user_id;
    effectiveCompanyId = effectiveCompanyId ?? dbSession.company_id;
    if (!dbSession.is_revoked || !dbSession.revoked_at) {
      await sessionRepo.revoke(dbSession.id, reason);
    }
  }

  // 3. Emit immutable audit log event
  try {
    await auditRepo.append({
      action: 'SESSION_REVOKED',
      entity_type: 'session',
      entity_id: sessionId,
      actor_id: effectiveUserId ?? null,
      company_id: effectiveCompanyId ?? null,
      ip_address: options?.ipAddress ?? inMemorySession?.ipAddress ?? '127.0.0.1',
      user_agent: options?.userAgent ?? inMemorySession?.userAgent ?? 'Unknown User-Agent',
      payload: {
        sessionId,
        reason,
        terminatedAt: nowIso,
        memoryRevoked,
        persistedDbRevoked: Boolean(dbSession),
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append SESSION_REVOKED audit log entry on logout', {
      sessionId,
      error: err,
    });
  }

  logger.info('Session successfully terminated via logout', {
    sessionId,
    userId: effectiveUserId,
    reason,
  });

  return {
    success: true,
    sessionId,
    clearCookieHeaders,
    message: 'Session successfully terminated. Cookies cleared.',
  };
}

/**
 * Step 059.2: Global Account Session Revocation (Global Kill-Switch).
 * Terminates all active logins immediately across all devices, browsers, and IP subnets.
 * - Revokes all active sessions for userId in memory store
 * - Marks all user sessions as revoked in PostgreSQL database repository
 * - Appends immutable GLOBAL_SESSION_REVOCATION audit log entry
 * - Returns expired cookie headers to terminate the calling client's session
 */
export async function revokeAllSessions(
  userId: string,
  options?: RevokeAllOptions
): Promise<RevokeAllResult> {
  const sessionRepo = options?.sessionRepo ?? defaultSessionRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const reason = options?.reason ?? 'USER_KILL_SWITCH';
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const clearCookieHeaders = getSessionClearCookieHeaders();

  // 1. Invalidate all user sessions in memory
  const memoryRevokedCount = revokeAllUserSessions(userId, reason);

  // 2. Invalidate all user sessions in PostgreSQL database repository
  const dbRevokedCount = await sessionRepo.revokeAllForUser(userId, reason);

  const totalRevokedCount = Math.max(memoryRevokedCount, dbRevokedCount);

  // 3. Emit immutable audit event
  try {
    await auditRepo.append({
      action: 'GLOBAL_SESSION_REVOCATION',
      entity_type: 'user',
      entity_id: userId,
      actor_id: options?.actorId ?? userId,
      company_id: options?.companyId ?? null,
      ip_address: options?.ipAddress ?? '127.0.0.1',
      user_agent: options?.userAgent ?? 'Unknown User-Agent',
      payload: {
        userId,
        reason,
        revokedAt: nowIso,
        memoryRevokedCount,
        dbRevokedCount,
        totalRevokedCount,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append GLOBAL_SESSION_REVOCATION audit log entry', {
      userId,
      error: err,
    });
  }

  logger.warn('Global session kill-switch executed: terminated all active user logins', {
    userId,
    totalRevokedCount,
    reason,
  });

  return {
    success: true,
    userId,
    revokedCount: totalRevokedCount,
    clearCookieHeaders,
    revokedAt: nowIso,
    reason,
    message: `All active sessions (${totalRevokedCount}) have been terminated across all devices.`,
  };
}

/**
 * Step 059.3: Automatic session termination trigger on password changes.
 * Guarantees that any stolen or open sessions on other devices are killed when a password is changed.
 */
export async function handlePasswordChangeSessionRevocation(
  userId: string,
  options?: RevokeAllOptions
): Promise<RevokeAllResult> {
  return await revokeAllSessions(userId, {
    ...options,
    reason: options?.reason ?? 'PASSWORD_CHANGED',
  });
}
