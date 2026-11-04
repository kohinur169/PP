// path: lib/auth/session-types.ts

export interface DeviceCharacteristics {
  ip: string;
  userAgent: string;
  acceptLanguage?: string | undefined;
  acceptEncoding?: string | undefined;
}

export interface UserSession {
  id: string;
  userId: string;
  tenantId?: string | undefined;
  sessionTokenHash: string;
  deviceFingerprint: string;
  deviceId?: string | undefined;
  ipAddress: string;
  userAgent: string;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | undefined;
  revocationReason?: string | undefined;
  rawToken?: string | undefined;
  cookieValue?: string | undefined;
  encryptedCookie?: string | undefined;
}

export type SessionErrorCode =
  | 'EXPIRED_IDLE'
  | 'EXPIRED_ABSOLUTE'
  | 'REVOKED'
  | 'FINGERPRINT_MISMATCH'
  | 'NOT_FOUND';

export interface SessionValidationResult {
  valid: boolean;
  session?: UserSession | undefined;
  errorCode?: SessionErrorCode | undefined;
  message?: string | undefined;
}

export interface CreateSessionParams {
  userId: string;
  tenantId?: string | undefined;
  token?: string | undefined;
  device: DeviceCharacteristics;
  deviceId?: string | undefined;
}

export interface SessionCookieOptions {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | 'strict' | 'lax' | 'none';
  path: string;
  maxAge: number;
}

export interface ParsedCookieAttributes {
  name: string;
  value: string;
  path?: string | undefined;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string | undefined;
  maxAge?: number | undefined;
  expires?: string | undefined;
}
