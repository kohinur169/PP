// path: lib/auth/session.ts
import crypto from 'node:crypto';
import type {
  UserSession,
  DeviceCharacteristics,
  SessionValidationResult,
  CreateSessionParams,
  SessionCookieOptions,
  ParsedCookieAttributes,
} from './session-types';
import {
  generateDeviceFingerprint,
  verifyDeviceFingerprint,
  hashSessionToken,
} from './fingerprint';
import {
  encryptWithDomainKey,
  decryptWithDomainKey,
} from '../crypto/aes';
import { logger } from '@/lib/logger';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (LR-022 rolling inactivity)
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours (LR-022 hard ceiling)
export const MAX_CONCURRENT_SESSIONS = 5; // LR-022 concurrent session limit

export const SESSION_COOKIE_NAME = 'kd_session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 28800; // 8 hours (ABSOLUTE_TIMEOUT_MS / 1000)

export const DEFAULT_SESSION_COOKIE_OPTIONS: SessionCookieOptions = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  path: '/',
  maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
};

// Fast memory store with persistence interface for active LR-022 sessions
const activeSessionsByTokenHash = new Map<string, UserSession>();
const activeSessionsById = new Map<string, UserSession>();

/**
 * Extracts client device characteristics from request headers.
 */
export function extractDeviceFromRequest(request: Request): DeviceCharacteristics {
  let ip = '127.0.0.1';
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    ip = cfIp.trim();
  } else {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) {
      ip = xff.split(',')[0]?.trim() || ip;
    } else {
      const realIp = request.headers.get('x-real-ip');
      if (realIp) ip = realIp.trim();
    }
  }

  const userAgent = request.headers.get('user-agent') || 'Unknown User-Agent';
  const acceptLanguage = request.headers.get('accept-language') || undefined;
  const acceptEncoding = request.headers.get('accept-encoding') || undefined;

  return { ip, userAgent, acceptLanguage, acceptEncoding };
}

/**
 * Encrypts a raw session secret token into an authenticated AES-256-GCM envelope
 * bound to the 'tokens' cryptographic subkey.
 */
export function encryptSessionToken(token: string): string {
  return encryptWithDomainKey('tokens', token);
}

/**
 * Decrypts an authenticated AES-256-GCM envelope back to its raw session token.
 * If the string is already a plain token or cannot be decrypted, handles gracefully.
 */
export function decryptSessionToken(encrypted: string): string | null {
  if (!encrypted) return null;
  if (!encrypted.startsWith('v1:')) {
    return encrypted;
  }
  try {
    return decryptWithDomainKey('tokens', encrypted);
  } catch {
    return null;
  }
}

/**
 * Formats a Set-Cookie header string strictly configured with HttpOnly, Secure,
 * SameSite=Strict, and path=/ for LR-022 compliance.
 */
export function buildSessionCookieHeader(
  tokenValue: string,
  options?: Partial<SessionCookieOptions>
): string {
  const opts = { ...DEFAULT_SESSION_COOKIE_OPTIONS, ...(options ?? {}) };
  const sameSiteFormatted =
    opts.sameSite.toLowerCase() === 'strict'
      ? 'Strict'
      : opts.sameSite.toLowerCase() === 'lax'
      ? 'Lax'
      : 'None';

  const parts = [
    `${opts.name}=${encodeURIComponent(tokenValue)}`,
    `Path=${opts.path}`,
  ];

  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${sameSiteFormatted}`);
  parts.push(`Max-Age=${opts.maxAge}`);

  return parts.join('; ');
}

/**
 * Formats an expired Set-Cookie header to explicitly clear the session cookie on logout.
 */
export function formatClearSessionCookieHeader(
  cookieName: string = SESSION_COOKIE_NAME
): string {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Parses a Cookie header string and retrieves the value of a specific cookie.
 */
export function parseCookieHeader(
  cookieHeader: string | null | undefined,
  cookieName: string = SESSION_COOKIE_NAME
): string | null {
  if (!cookieHeader) return null;
  const pattern = new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`);
  const match = cookieHeader.match(pattern);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Inspects a Set-Cookie header string and extracts all cookie attributes
 * for security verification and test assertions.
 */
export function parseCookieAttributes(cookieHeader: string): ParsedCookieAttributes {
  const parts = cookieHeader.split(';').map((p) => p.trim());
  const [firstPart, ...rest] = parts;
  const eqIdx = firstPart ? firstPart.indexOf('=') : -1;
  const name = eqIdx >= 0 ? firstPart!.slice(0, eqIdx) : '';
  const value = eqIdx >= 0 ? decodeURIComponent(firstPart!.slice(eqIdx + 1)) : '';

  let path: string | undefined;
  let httpOnly = false;
  let secure = false;
  let sameSite: string | undefined;
  let maxAge: number | undefined;
  let expires: string | undefined;

  for (const part of rest) {
    const lower = part.toLowerCase();
    if (lower === 'httponly') httpOnly = true;
    else if (lower === 'secure') secure = true;
    else if (lower.startsWith('samesite=')) {
      sameSite = part.split('=')[1]?.trim();
    } else if (lower.startsWith('path=')) {
      path = part.split('=')[1]?.trim();
    } else if (lower.startsWith('max-age=')) {
      const parsed = parseInt(part.split('=')[1]?.trim() || '', 10);
      if (!Number.isNaN(parsed)) maxAge = parsed;
    } else if (lower.startsWith('expires=')) {
      expires = part.slice(part.indexOf('=') + 1).trim();
    }
  }

  return {
    name,
    value,
    path,
    httpOnly,
    secure,
    sameSite,
    maxAge,
    expires,
  };
}

/**
 * Extracts session token from incoming request headers (cookie or bearer token).
 */
export function extractSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  const tokenFromCookie = parseCookieHeader(cookieHeader, SESSION_COOKIE_NAME);
  if (tokenFromCookie) return tokenFromCookie;

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

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
 * Generates an encrypted session cookie header configured with HttpOnly, Secure, SameSite=Strict.
 */
export function createSession(
  userIdOrParams: string | CreateSessionParams,
  deviceContext?: DeviceCharacteristics,
  options?: {
    tenantId?: string;
    deviceId?: string;
    token?: string;
    sessionFamilyId?: string;
    parentSessionId?: string;
  }
): UserSession {
  let userId: string;
  let device: DeviceCharacteristics;
  let tenantId: string | undefined;
  let deviceId: string | undefined;
  let rawToken: string | undefined;
  let sessionFamilyId: string | undefined;
  let parentSessionId: string | undefined;

  if (typeof userIdOrParams === 'string') {
    userId = userIdOrParams;
    if (!deviceContext) {
      throw new Error('Device characteristics must be provided when creating a session by user ID.');
    }
    device = deviceContext;
    tenantId = options?.tenantId;
    deviceId = options?.deviceId;
    rawToken = options?.token;
    sessionFamilyId = options?.sessionFamilyId;
    parentSessionId = options?.parentSessionId;
  } else {
    userId = userIdOrParams.userId;
    device = userIdOrParams.device;
    tenantId = userIdOrParams.tenantId;
    deviceId = userIdOrParams.deviceId;
    rawToken = userIdOrParams.token;
    sessionFamilyId = userIdOrParams.sessionFamilyId;
    parentSessionId = userIdOrParams.parentSessionId;
  }

  // Enforce concurrent session limit before allocating new session
  enforceConcurrentSessionLimit(userId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS);

  if (!rawToken || rawToken.trim().length === 0) {
    rawToken = crypto.randomBytes(32).toString('hex');
  }

  const tokenHash = hashSessionToken(rawToken);
  const fingerprint = generateDeviceFingerprint(device);
  const sessionId = crypto.randomUUID();
  const familyId = sessionFamilyId || crypto.randomUUID();

  // Encrypt session token for secure client cookie storage
  const encryptedCookie = encryptSessionToken(rawToken);
  // Build LR-022 compliant HttpOnly, Secure, SameSite=Strict cookie header
  const cookieValue = buildSessionCookieHeader(encryptedCookie);

  const newSession: UserSession = {
    id: sessionId,
    sessionFamilyId: familyId,
    userId,
    tenantId,
    deviceId,
    sessionTokenHash: tokenHash,
    deviceFingerprint: fingerprint,
    ipAddress: device.ip,
    userAgent: device.userAgent,
    lastActiveAt: now.toISOString(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isRevoked: false,
    isConsumed: false,
    parentSessionId: parentSessionId ?? undefined,
    rawToken,
    cookieValue,
    encryptedCookie,
  };

  activeSessionsByTokenHash.set(tokenHash, newSession);
  activeSessionsById.set(sessionId, newSession);

  logger.info('LR-022 session created successfully', {
    sessionId: newSession.id,
    sessionFamilyId: newSession.sessionFamilyId,
    userId: newSession.userId,
    tenantId: newSession.tenantId,
  });

  return newSession;
}

/**
 * Retrieves a session by its raw or encrypted token and validates it against current device characteristics.
 */
export function getAndValidateSession(
  token: string,
  device: DeviceCharacteristics,
  currentTime: number = Date.now()
): SessionValidationResult {
  let rawToken = token;
  if (token.startsWith('v1:')) {
    const decrypted = decryptSessionToken(token);
    if (decrypted) {
      rawToken = decrypted;
    }
  }

  const tokenHash = hashSessionToken(rawToken);
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
 * Validates a session extracted directly from an incoming HTTP Request.
 */
export function validateSessionFromRequest(
  request: Request,
  options?: { currentTime?: number }
): SessionValidationResult {
  const token = extractSessionTokenFromRequest(request);
  if (!token) {
    return {
      valid: false,
      errorCode: 'NOT_FOUND',
      message: 'No session token or cookie supplied in request headers.',
    };
  }

  const device = extractDeviceFromRequest(request);
  return getAndValidateSession(token, device, options?.currentTime);
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
 * Revokes all sessions belonging to a specific session_family_id lineage.
 * Invoked immediately upon detecting a replayed or stolen session token.
 */
export function revokeSessionFamily(
  familyId: string,
  reason: string = 'SESSION_REPLAY_DETECTED'
): number {
  let count = 0;
  for (const session of activeSessionsById.values()) {
    if (session.sessionFamilyId === familyId && !session.revokedAt) {
      session.revokedAt = new Date().toISOString();
      session.revocationReason = reason;
      session.isRevoked = true;
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

/**
 * Retrieves an active in-memory session by its ID.
 */
export function getActiveSessionById(sessionId: string): UserSession | undefined {
  return activeSessionsById.get(sessionId);
}

/**
 * Retrieves an active in-memory session by its token hash.
 */
export function getActiveSessionByTokenHash(tokenHash: string): UserSession | undefined {
  return activeSessionsByTokenHash.get(tokenHash);
}
