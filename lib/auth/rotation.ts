// path: lib/auth/rotation.ts

import crypto from 'node:crypto';
import type {
  UserSession,
  DeviceCharacteristics,
  SessionValidationResult,
} from './session-types';
import {
  createSession,
  decryptSessionToken,
  revokeSessionFamily,
  validateSessionRecord,
  getActiveSessionById,
  getActiveSessionByTokenHash,
} from './session';
import { hashSessionToken } from './fingerprint';
import { SessionRepository } from '../db/sessions';
import { AuditLogRepository } from '../db/audit';
import { logger } from '../logger';

export interface RotateSessionOptions {
  readonly sessionRepo?: SessionRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly device?: DeviceCharacteristics | undefined;
  readonly nowMs?: number | undefined;
}

export interface SessionRotationResult {
  readonly success: boolean;
  readonly session?: UserSession | undefined;
  readonly rawToken?: string | undefined;
  readonly cookieValue?: string | undefined;
  readonly previousSessionId?: string | undefined;
  readonly replayDetected?: boolean | undefined;
  readonly familyRevoked?: boolean | undefined;
  readonly error?: 'NOT_FOUND' | 'REVOKED' | 'REPLAY_DETECTED' | 'EXPIRED' | undefined;
  readonly message: string;
}

const defaultSessionRepo = new SessionRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Step 057.3: Handles detected replay attacks by immediately invalidating the entire
 * session_family_id lineage across both in-memory state and persisted database records.
 */
export async function handleReplayAttack(
  sessionFamilyId: string,
  compromisedSession: UserSession,
  options?: RotateSessionOptions
): Promise<number> {
  const sessionRepo = options?.sessionRepo ?? defaultSessionRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  // 1. Immediately revoke all active sessions in the family in fast memory
  const memoryRevokedCount = revokeSessionFamily(
    sessionFamilyId,
    'SESSION_REPLAY_DETECTED'
  );

  // 2. Persist revocation of entire family in database
  const dbRevokedCount = await sessionRepo.revokeFamily(
    sessionFamilyId,
    'SESSION_REPLAY_DETECTED'
  );

  logger.warn(
    'LR-022 Token replay attack detected - invalidated entire session family',
    {
      sessionFamilyId,
      userId: compromisedSession.userId,
      compromisedSessionId: compromisedSession.id,
      memoryRevokedCount,
      dbRevokedCount,
    }
  );

  // 3. Emit tamper-evident security audit log
  await auditRepo.append({
    action: 'SESSION_REPLAY_DETECTED',
    entity_type: 'session_family',
    entity_id: sessionFamilyId,
    actor_id: compromisedSession.userId,
    company_id: compromisedSession.tenantId ?? '00000000-0000-7000-8000-000000000000',
    ip_address: options?.device?.ip ?? compromisedSession.ipAddress,
    user_agent: options?.device?.userAgent ?? compromisedSession.userAgent,
    payload: {
      sessionFamilyId,
      compromisedSessionId: compromisedSession.id,
      userId: compromisedSession.userId,
      reason: 'TOKEN_REPLAY_ATTACK',
      revokedSessionsCount: Math.max(memoryRevokedCount, dbRevokedCount),
    },
  });

  return Math.max(memoryRevokedCount, dbRevokedCount);
}

/**
 * Step 057.2: Rotates an existing session token. Generates a fresh token, links child
 * session to parent in the same session_family_id, and marks previous token consumed.
 * If a previously consumed token is presented, detects replay attack and invalidates family.
 */
export async function rotateSession(
  currentSessionIdOrToken: string,
  options?: RotateSessionOptions
): Promise<SessionRotationResult> {
  const sessionRepo = options?.sessionRepo ?? defaultSessionRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // 1. Resolve raw token if an encrypted cookie or raw token was passed
  let lookupToken = currentSessionIdOrToken;
  if (currentSessionIdOrToken.startsWith('v1:')) {
    const decrypted = decryptSessionToken(currentSessionIdOrToken);
    if (decrypted) lookupToken = decrypted;
  }

  const lookupHash = hashSessionToken(lookupToken);

  // 2. Locate active session by ID or token hash in memory or database
  let session = findActiveSession(currentSessionIdOrToken, lookupHash);

  if (!session) {
    // Attempt database lookup
    const dbRecord =
      (await sessionRepo.findBySessionId(currentSessionIdOrToken)) ||
      (await sessionRepo.findByTokenHash(lookupHash));

    if (dbRecord) {
      session = {
        id: dbRecord.id,
        sessionFamilyId: dbRecord.session_family_id,
        userId: dbRecord.user_id,
        tenantId: dbRecord.company_id ?? undefined,
        deviceId: dbRecord.device_id ?? undefined,
        sessionTokenHash: dbRecord.token_hash,
        deviceFingerprint: dbRecord.device_fingerprint,
        ipAddress: dbRecord.ip_address,
        userAgent: dbRecord.user_agent,
        lastActiveAt: dbRecord.last_active_at,
        createdAt: dbRecord.created_at,
        expiresAt: dbRecord.expires_at,
        revokedAt: dbRecord.revoked_at ?? undefined,
        revocationReason: dbRecord.revocation_reason ?? undefined,
        isRevoked: dbRecord.is_revoked,
        isConsumed: dbRecord.is_consumed,
        consumedAt: dbRecord.consumed_at ?? undefined,
        parentSessionId: dbRecord.parent_session_id ?? undefined,
      };
    }
  }

  if (!session) {
    return {
      success: false,
      error: 'NOT_FOUND',
      message: 'Session not found.',
    };
  }

  const familyId = session.sessionFamilyId || session.id;

  // 3. Step 057.3: Replay Detection Check
  // If presenting a token that was already marked as consumed, cookie theft/replay has occurred!
  if (session.isConsumed) {
    await handleReplayAttack(familyId, session, options);

    return {
      success: false,
      replayDetected: true,
      familyRevoked: true,
      error: 'REPLAY_DETECTED',
      message:
        'Security Alert: Replayed or stolen session token detected. All sessions in this family have been immediately revoked.',
    };
  }

  // 4. Revocation check
  if (session.isRevoked || session.revokedAt) {
    return {
      success: false,
      error: 'REVOKED',
      message: 'Session has already been revoked.',
    };
  }

  // 5. Mark previous session token as consumed
  session.isConsumed = true;
  session.consumedAt = nowIso;
  await sessionRepo.markConsumed(session.id, nowIso);

  // 6. Generate fresh 256-bit token and spawn child session in identical session_family_id
  const newToken = crypto.randomBytes(32).toString('hex');
  const deviceContext: DeviceCharacteristics = options?.device ?? {
    ip: session.ipAddress,
    userAgent: session.userAgent,
  };

  const newSession = createSession({
    userId: session.userId,
    tenantId: session.tenantId,
    deviceId: session.deviceId,
    token: newToken,
    device: deviceContext,
    sessionFamilyId: familyId,
    parentSessionId: session.id,
  });

  // 7. Persist child session in database repository
  await sessionRepo.create({
    session_id: newSession.id,
    session_family_id: familyId,
    parent_session_id: session.id,
    user_id: newSession.userId,
    company_id: newSession.tenantId ?? '00000000-0000-7000-8000-000000000000',
    token_hash: newSession.sessionTokenHash,
    device_id: newSession.deviceId ?? null,
    device_fingerprint: newSession.deviceFingerprint,
    ip_address: newSession.ipAddress,
    user_agent: newSession.userAgent,
    last_active_at: newSession.lastActiveAt,
    expires_at: newSession.expiresAt,
    is_revoked: false,
    is_consumed: false,
    consumed_at: null,
    revoked_at: null,
    revocation_reason: null,
  });

  // 8. Record audit log
  await auditRepo.append({
    action: 'SESSION_ROTATED',
    entity_type: 'session',
    entity_id: newSession.id,
    actor_id: newSession.userId,
    company_id: newSession.tenantId ?? '00000000-0000-7000-8000-000000000000',
    ip_address: newSession.ipAddress,
    user_agent: newSession.userAgent,
    payload: {
      sessionFamilyId: familyId,
      previousSessionId: session.id,
      newSessionId: newSession.id,
      userId: newSession.userId,
    },
  });

  logger.info('LR-022 session rotated successfully', {
    sessionFamilyId: familyId,
    previousSessionId: session.id,
    newSessionId: newSession.id,
    userId: newSession.userId,
  });

  return {
    success: true,
    session: newSession,
    rawToken: newToken,
    cookieValue: newSession.cookieValue,
    previousSessionId: session.id,
    message: 'Session token rotated successfully.',
  };
}

/**
 * Step 057.3: Validates an incoming session token and triggers instant family
 * invalidation if an already-consumed token is presented.
 */
export async function validateAndDetectReplay(
  tokenOrEncrypted: string,
  device: DeviceCharacteristics,
  options?: RotateSessionOptions
): Promise<SessionValidationResult & { replayDetected?: boolean | undefined }> {
  let rawToken = tokenOrEncrypted;
  if (tokenOrEncrypted.startsWith('v1:')) {
    const decrypted = decryptSessionToken(tokenOrEncrypted);
    if (decrypted) rawToken = decrypted;
  }

  const tokenHash = hashSessionToken(rawToken);
  const session = findActiveSession(undefined, tokenHash);

  if (!session) {
    return {
      valid: false,
      errorCode: 'NOT_FOUND',
      message: 'Session token not found or already terminated.',
    };
  }

  // Replay detection check on presentation
  if (session.isConsumed) {
    const familyId = session.sessionFamilyId || session.id;
    await handleReplayAttack(familyId, session, options);

    return {
      valid: false,
      errorCode: 'REVOKED',
      replayDetected: true,
      message:
        'Security Alert: Replayed or stolen session token detected. All sessions in this family have been immediately revoked.',
    };
  }

  return validateSessionRecord(session, device, options?.nowMs ?? Date.now());
}

/**
 * Helper locating an active session by ID or token hash in active maps.
 */
function findActiveSession(
  sessionId?: string,
  tokenHash?: string
): UserSession | undefined {
  if (sessionId) {
    const byId = getActiveSessionById(sessionId);
    if (byId) return byId;
  }

  if (tokenHash) {
    const byHash = getActiveSessionByTokenHash(tokenHash);
    if (byHash) return byHash;
  }

  return undefined;
}
