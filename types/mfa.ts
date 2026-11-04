// path: types/mfa.ts

import type { BaseEntity } from './entity';

/**
 * Persisted MFA security state for a user.
 * Encrypted at rest using AES-256-GCM.
 */
export interface UserMfaEntity extends BaseEntity {
  user_id: string;
  totp_secret_encrypted: string;
  mfa_enabled: boolean;
  backup_codes_hashes: string[];
  last_used_step: number | null;
}

/**
 * Input payload for creating or resetting a user's MFA enrollment.
 */
export interface CreateUserMfaInput {
  user_id: string;
  totp_secret_encrypted: string;
  mfa_enabled?: boolean | undefined;
  backup_codes_hashes?: string[] | undefined;
  last_used_step?: number | null | undefined;
}

/**
 * Result data returned when initializing TOTP enrollment.
 */
export interface UserTotpSetupData {
  secret: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
  encryptedSecret: string;
}

/**
 * Verification request payload.
 */
export interface VerifyEnrollmentRequest {
  code: string;
}

/**
 * Verification response payload.
 */
export interface VerifyEnrollmentResponse {
  success: boolean;
  message: string;
  mfa_enabled: boolean;
  activated_at?: string | undefined;
}
