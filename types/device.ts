// path: types/device.ts

import { z } from 'zod';
import type { BaseEntity } from './entity';

export const UserDeviceCreateSchema = z.object({
  user_id: z.string().uuid(),
  company_id: z.string().uuid().optional(),
  device_fingerprint: z.string().min(16).max(64),
  proof_key: z.string().min(32).max(128),
  device_name: z.string().max(255).default('Unknown Device'),
  first_seen_at: z.string().datetime().optional(),
  last_seen_at: z.string().datetime().optional(),
  last_ip: z.string().max(45),
  last_user_agent: z.string().default('Unknown User-Agent'),
  is_trusted: z.boolean().default(false),
  confirmation_code_hash: z.string().max(64).nullable().optional(),
  confirmation_code_expires_at: z.string().datetime().nullable().optional(),
  confirmed_at: z.string().datetime().nullable().optional(),
});

export type CreateUserDeviceInput = z.infer<typeof UserDeviceCreateSchema>;

export const UserDeviceUpdateSchema = z.object({
  device_name: z.string().max(255).optional(),
  last_seen_at: z.string().datetime().optional(),
  last_ip: z.string().max(45).optional(),
  last_user_agent: z.string().optional(),
  is_trusted: z.boolean().optional(),
  confirmation_code_hash: z.string().max(64).nullable().optional(),
  confirmation_code_expires_at: z.string().datetime().nullable().optional(),
  confirmed_at: z.string().datetime().nullable().optional(),
});

export type UpdateUserDeviceInput = z.infer<typeof UserDeviceUpdateSchema>;

export interface UserDeviceEntity extends BaseEntity {
  user_id: string;
  device_fingerprint: string;
  proof_key: string;
  device_name: string;
  first_seen_at: string;
  last_seen_at: string;
  last_ip: string;
  last_user_agent: string;
  is_trusted: boolean;
  confirmation_code_hash: string | null;
  confirmation_code_expires_at: string | null;
  confirmed_at: string | null;
}

export interface DeviceRecognitionResult {
  readonly isNewDevice: boolean;
  readonly device: UserDeviceEntity;
  readonly requiresConfirmation: boolean;
  readonly confirmationCode?: string | undefined;
  readonly alertDispatched?: boolean | undefined;
}

export interface NewDeviceAlertEmailParams {
  readonly email: string;
  readonly userId: string;
  readonly confirmationCode: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly deviceName: string;
  readonly detectedAt: string;
}

export interface NewDeviceAlertEmailResult {
  readonly dispatched: boolean;
  readonly recipient: string;
  readonly subject: string;
  readonly confirmationCode: string;
}

export interface ConfirmDeviceResult {
  readonly success: boolean;
  readonly device?: UserDeviceEntity | undefined;
  readonly error?: 'DEVICE_NOT_FOUND' | 'CODE_EXPIRED' | 'INVALID_CODE' | undefined;
  readonly message: string;
}
