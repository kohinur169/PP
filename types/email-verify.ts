// path: types/email-verify.ts

import { z } from 'zod';
import { BaseEntity, CreateEntityInput, UpdateEntityInput } from './entity';

/**
 * Enterprise Email Verification Token Entity.
 * Stores cryptographically secure SHA-256 token digest with 24-hour expiration.
 */
export interface EmailVerificationTokenEntity extends BaseEntity {
  readonly user_id: string;
  readonly token_hash: string;
  readonly expires_at: string;
  readonly used_at: string | null;
}

/**
 * Input type for creating a new verification token record.
 */
export type CreateEmailVerificationTokenInput = CreateEntityInput<EmailVerificationTokenEntity>;

/**
 * Input type for mutating an existing verification token record.
 */
export type UpdateEmailVerificationTokenInput = UpdateEntityInput<EmailVerificationTokenEntity>;

/**
 * Zod validation schema for token generation input.
 */
export const EmailVerificationTokenCreateSchema = z.object({
  user_id: z.string().uuid('Valid user UUID is required'),
  token_hash: z
    .string()
    .length(64, 'Token hash must be a 64-character SHA-256 hex string')
    .regex(/^[0-9a-f]{64}$/i, 'Token hash must be valid hexadecimal'),
  expires_at: z.string().datetime('Valid ISO 8601 expiration timestamp is required'),
  used_at: z.string().datetime().nullable().default(null),
});

/**
 * Result structure returned after generating a verification token.
 */
export interface GeneratedVerificationToken {
  readonly tokenId: string;
  readonly rawToken: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly verificationUrl: string;
}

/**
 * Result structure returned after verifying a token.
 */
export interface VerifyEmailResult {
  readonly success: boolean;
  readonly message: string;
  readonly userId?: string | undefined;
  readonly email?: string | undefined;
  readonly error?:
    | 'INVALID_TOKEN'
    | 'TOKEN_EXPIRED'
    | 'TOKEN_ALREADY_USED'
    | 'USER_NOT_FOUND'
    | undefined;
}
