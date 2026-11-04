// path: types/session.ts

import { z } from 'zod';
import type { BaseEntity } from './entity';

export const SessionCreateSchema = z.object({
  session_id: z.string().uuid().optional(),
  session_family_id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  company_id: z.string().uuid().optional(),
  token_hash: z.string().min(16).max(64),
  device_id: z.string().max(128).nullable().optional(),
  device_fingerprint: z.string().max(64).default(''),
  ip_address: z.string().max(45).default('127.0.0.1'),
  user_agent: z.string().default('Unknown User-Agent'),
  last_active_at: z.string().datetime().optional(),
  expires_at: z.string().datetime(),
  revoked_at: z.string().datetime().nullable().optional(),
  revocation_reason: z.string().max(64).nullable().optional(),
  is_revoked: z.boolean().default(false),
  is_consumed: z.boolean().default(false),
  consumed_at: z.string().datetime().nullable().optional(),
  parent_session_id: z.string().uuid().nullable().optional(),
});

export type CreateSessionInput = z.infer<typeof SessionCreateSchema>;

export const SessionUpdateSchema = z.object({
  last_active_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  revoked_at: z.string().datetime().nullable().optional(),
  revocation_reason: z.string().max(64).nullable().optional(),
  device_id: z.string().max(128).nullable().optional(),
  is_revoked: z.boolean().optional(),
  is_consumed: z.boolean().optional(),
  consumed_at: z.string().datetime().nullable().optional(),
  parent_session_id: z.string().uuid().nullable().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
});

export type UpdateSessionInput = z.infer<typeof SessionUpdateSchema>;

export interface SessionEntity extends BaseEntity {
  session_id?: string | undefined;
  session_family_id: string;
  user_id: string;
  token_hash: string;
  device_id: string | null;
  device_fingerprint: string;
  ip_address: string;
  user_agent: string;
  last_active_at: string;
  expires_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
  is_revoked: boolean;
  is_consumed: boolean;
  consumed_at: string | null;
  parent_session_id: string | null;
}

export type CreateSessionRecordInput = Omit<
  import('./entity').CreateEntityInput<SessionEntity>,
  'session_family_id' | 'is_revoked' | 'is_consumed' | 'consumed_at' | 'parent_session_id'
> & {
  readonly session_family_id?: string | undefined;
  readonly is_revoked?: boolean | undefined;
  readonly is_consumed?: boolean | undefined;
  readonly consumed_at?: string | null | undefined;
  readonly parent_session_id?: string | null | undefined;
};
