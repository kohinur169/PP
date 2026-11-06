// path: types/user.ts

import { z } from 'zod';
import { BaseEntity, CreateEntityInput, UpdateEntityInput } from './entity';

/**
 * Enterprise user account security statuses.
 */
export type UserAccountStatus =
  | 'pending_verification'
  | 'active'
  | 'locked'
  | 'suspended'
  | 'offboarded';

/**
 * Full User Identity entity supporting merchant owners and platform office staff.
 */
export interface UserEntity extends BaseEntity {
  readonly email: string;
  readonly full_legal_name: string;
  readonly password_hash: string;
  readonly phone?: string | null | undefined;
  readonly phone_hash?: string | null | undefined;
  readonly failed_attempts: number;
  readonly locked_until: string | null;
  readonly password_changed_at: string;
  readonly is_staff: boolean;
  readonly status: UserAccountStatus;
  readonly email_verified_at?: string | null | undefined;
  readonly must_setup_2fa?: boolean | undefined;
}

/**
 * Input type for creating a new user record.
 * password_changed_at is automatically initialized to current clock timestamp.
 */
export type CreateUserInput = Omit<
  CreateEntityInput<UserEntity>,
  'password_changed_at'
> & {
  readonly password_changed_at?: string | undefined;
};

/**
 * Input type for mutating an existing user record.
 */
export type UpdateUserInput = UpdateEntityInput<UserEntity>;

/**
 * Zod validation schema for user registration.
 */
export const UserCreateSchema = z.object({
  email: z.string().email('Invalid email address format').toLowerCase().trim(),
  full_legal_name: z.string().min(2, 'Full legal name must be at least 2 characters').max(255).trim(),
  password_hash: z.string().min(1, 'Password hash is required'),
  phone: z.string().optional().nullable(),
  phone_hash: z.string().max(64).optional().nullable(),
  failed_attempts: z.number().int().min(0).default(0),
  locked_until: z.string().datetime().optional().nullable().default(null),
  is_staff: z.boolean().default(false),
  status: z.enum(['pending_verification', 'active', 'locked', 'suspended', 'offboarded']).default('pending_verification'),
  must_setup_2fa: z.boolean().default(false),
});

/**
 * Zod schema for updating user credentials, lockout, or profile attributes.
 */
export const UserUpdateSchema = UserCreateSchema.partial();
