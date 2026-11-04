// path: lib/validation/auth.ts

import { z } from 'zod';

/**
 * Enterprise Password Complexity Regex (NIST SP 800-63B & LR-022 baseline):
 * Minimum 12 characters, at least 1 uppercase, 1 lowercase, 1 number, and 1 special symbol.
 */
export const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/;

/**
 * Strict Password Schema meeting enterprise cybersecurity baselines.
 */
export const RegisterPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password cannot exceed 128 characters')
  .regex(
    PASSWORD_COMPLEXITY_REGEX,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special symbol'
  );

/**
 * Normalized Email Schema: trims whitespace and converts to lowercase.
 */
export const RegisterEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Email address is required')
  .max(254, 'Email address cannot exceed 254 characters')
  .email('Invalid email address format');

/**
 * Full Legal Name Schema: trims whitespace, min 2 chars, max 255 chars.
 */
export const FullLegalNameSchema = z
  .string()
  .min(2, 'Full legal name must be at least 2 characters')
  .max(255, 'Full legal name cannot exceed 255 characters')
  .trim();

/**
 * Cloudflare Turnstile Bot Verification Token Schema.
 */
export const TurnstileTokenSchema = z
  .string()
  .min(1, 'Cloudflare Turnstile verification token is required')
  .max(4096, 'Turnstile token exceeds maximum permitted length')
  .trim();

/**
 * Step 046.1: Merchant & Staff Registration Zod Schema.
 * Requires email, password, full legal name, and Turnstile token.
 */
export const RegisterRequestSchema = z.object({
  email: RegisterEmailSchema,
  password: RegisterPasswordSchema,
  full_legal_name: FullLegalNameSchema,
  turnstile_token: TurnstileTokenSchema,
  company_name: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(255)
    .trim()
    .optional(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Phone number must be valid E.164 format')
    .optional()
    .nullable(),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/**
 * Standard successful response envelope for registration.
 */
export interface RegisterResponse {
  readonly status: 'pending_verification';
  readonly user_id: string;
  readonly email: string;
  readonly full_legal_name: string;
  readonly company_id?: string | null | undefined;
  readonly message: string;
  readonly created_at: string;
}
