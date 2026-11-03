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
  ipAddress: string;
  userAgent: string;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | undefined;
  revocationReason?: string | undefined;
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
  token: string;
  device: DeviceCharacteristics;
}
