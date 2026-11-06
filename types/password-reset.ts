// path: types/password-reset.ts

import { z } from 'zod';
import type { BaseEntity } from './entity';

/**
 * Persisted Password Reset Token Entity.
 * Tracks cryptographic SHA-256 token hash, 1-hour expiration, and single-use consumption.
 */
export interface PasswordResetTokenEntity extends BaseEntity {
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
}

export const PasswordResetTokenCreateSchema = z.object({
  user_id: z.string().uuid(),
  company_id: z.string().uuid().optional(),
  token_hash: z.string().length(64),
  expires_at: z.string().datetime(),
  used_at: z.string().datetime().nullable().optional(),
});

export type CreatePasswordResetTokenInput = z.infer<typeof PasswordResetTokenCreateSchema>;

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().trim().email('A valid email address is required'),
  turnstile_token: z.string().min(1, 'Turnstile verification token is required'),
});

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(32, 'Password reset token must be at least 32 characters'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  turnstile_token: z.string().optional(),
});

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export interface GeneratedResetToken {
  readonly tokenId: string;
  readonly userId: string;
  readonly rawToken: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly resetUrl: string;
}

export interface ForgotPasswordResult {
  readonly success: boolean;
  readonly message: string;
  readonly tokenGenerated: boolean;
  readonly isLocked?: boolean | undefined;
  readonly tokenId?: string | undefined;
  readonly rawToken?: string | undefined;
  readonly expiresAt?: string | undefined;
}

export interface ResetPasswordResult {
  readonly success: boolean;
  readonly message: string;
  readonly userId?: string | undefined;
  readonly error?:
    | 'ACCOUNT_LOCKED'
    | 'INVALID_TOKEN'
    | 'TOKEN_EXPIRED'
    | 'TOKEN_ALREADY_USED'
    | 'WEAK_PASSWORD'
    | 'PWNED_PASSWORD'
    | 'USER_NOT_FOUND'
    | undefined;
}
