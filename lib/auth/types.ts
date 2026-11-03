// path: lib/auth/types.ts
import { z } from 'zod';
import { EmailSchema, UUIDv7Schema, SafeTextSchema } from '@/lib/validation';
import type { MembershipRole } from '@/lib/database';

// Password complexity regex: min 12 chars, upper, lower, number, and special symbol
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/;

/**
 * Strict Password Schema meeting enterprise cybersecurity standards (NIST SP 800-63B).
 */
export const PasswordSchema = z
  .string()
  .min(12, { message: 'Password must be at least 12 characters long' })
  .regex(PASSWORD_REGEX, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special symbol',
  });

/**
 * Tenant User Registration Schema.
 */
export const SignUpInputSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  fullName: SafeTextSchema(100),
  tenantId: UUIDv7Schema.optional(),
  tenantName: SafeTextSchema(100).optional(),
  role: z
    .enum(['owner', 'admin', 'compliance_officer', 'developer', 'merchant_viewer'])
    .default('owner'),
});

export type SignUpInput = z.infer<typeof SignUpInputSchema>;

/**
 * User Login Authentication Schema.
 */
export const SignInInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, { message: 'Password is required' }),
});

export type SignInInput = z.infer<typeof SignInInputSchema>;

/**
 * Password Reset Request Schema.
 */
export const PasswordResetRequestSchema = z.object({
  email: EmailSchema,
});

export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

/**
 * Password Update / Reset Submission Schema.
 */
export const PasswordUpdateSchema = z
  .object({
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type PasswordUpdate = z.infer<typeof PasswordUpdateSchema>;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  isSuperadmin: boolean;
  status: string;
  createdAt: string;
  tenantId?: string | undefined;
  role?: MembershipRole | undefined;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser | undefined;
  session?: AuthSession | undefined;
  error?: string | undefined;
}
