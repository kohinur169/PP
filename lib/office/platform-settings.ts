// path: lib/office/platform-settings.ts

import { z } from 'zod';
import { Role, Permission, assertPermission } from '@/lib/auth/roles';
import {
  consumeStepUpTicket,
  createStepUpChallenge,
} from '@/lib/auth/step-up';
import { StepUpChallenge } from '@/lib/auth/step-up-types';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

/**
 * Enterprise Global Platform Settings for KD Solution IT PayFac.
 */
export interface PlatformSettings {
  readonly platformName: string;
  readonly logoUrl: string;
  readonly supportEmail: string;
  readonly supportPhone: string;
  readonly baseCurrency: 'USD';
  readonly defaultFeePercent: string;
  readonly defaultReservePercent: string;
  readonly emergencyKillswitch: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

/**
 * Input type for updating platform settings.
 */
export interface UpdatePlatformSettingsInput {
  readonly platformName?: string | undefined;
  readonly logoUrl?: string | undefined;
  readonly supportEmail?: string | undefined;
  readonly supportPhone?: string | undefined;
  readonly defaultFeePercent?: string | undefined;
  readonly defaultReservePercent?: string | undefined;
  readonly emergencyKillswitch?: boolean | undefined;
}

/**
 * Zod validation schema for platform settings updates.
 */
export const PlatformSettingsUpdateSchema = z.object({
  platformName: z.string().min(2, 'Platform name must be at least 2 characters').max(100).optional(),
  logoUrl: z.string().min(1, 'Logo URL must not be empty').max(500).optional(),
  supportEmail: z.string().email('Invalid support email address format').toLowerCase().optional(),
  supportPhone: z.string().min(5, 'Support phone must be valid').max(30).optional(),
  defaultFeePercent: z
    .string()
    .regex(/^\d{1,3}\.\d{4}$/, 'Default fee percent must follow decimal format e.g. 2.9000')
    .optional(),
  defaultReservePercent: z
    .string()
    .regex(/^\d{1,3}\.\d{4}$/, 'Default reserve percent must follow decimal format e.g. 10.0000')
    .optional(),
  emergencyKillswitch: z.boolean().optional(),
});

/**
 * Default factory settings baseline.
 */
const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  platformName: 'KD Solution PayFac',
  logoUrl: '/images/logo.png',
  supportEmail: 'support@kdsolution.it',
  supportPhone: '+1-800-555-0199',
  baseCurrency: 'USD',
  defaultFeePercent: '2.9000',
  defaultReservePercent: '10.0000',
  emergencyKillswitch: false,
  updatedAt: '2026-11-04T00:00:00.000Z',
  updatedBy: 'system',
};

// In-memory active platform configuration
let activePlatformSettings: PlatformSettings = { ...DEFAULT_PLATFORM_SETTINGS };

/**
 * Resets platform configuration state (useful for unit test isolation).
 */
export function resetPlatformSettingsForTest(): void {
  activePlatformSettings = { ...DEFAULT_PLATFORM_SETTINGS };
}

/**
 * Retrieves the current global platform settings.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  return { ...activePlatformSettings };
}

export interface UpdatePlatformSettingsOptions {
  readonly actorId: string;
  readonly actorRole: Role;
  readonly stepUpTicket?: string | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly clientIp?: string | undefined;
}

export type UpdatePlatformSettingsResult =
  | { readonly success: true; readonly settings: PlatformSettings }
  | { readonly success: false; readonly challengeRequired: true; readonly challenge: StepUpChallenge };

/**
 * Step 066.2 & Step 066.4: Updates global platform settings with Super Admin authorization
 * and mandatory step-up 2FA reauthentication ticket verification.
 */
export async function updatePlatformSettings(
  input: UpdatePlatformSettingsInput,
  options: UpdatePlatformSettingsOptions
): Promise<UpdatePlatformSettingsResult> {
  const { actorId, actorRole, stepUpTicket, auditRepo, clientIp } = options;

  // 1. Role Authorization Gate: Requires MANAGE_PLATFORM_SETTINGS (Super Admin)
  assertPermission(actorRole, Permission.MANAGE_PLATFORM_SETTINGS);

  // 2. Step 066.4: Enforce Step-Up 2FA Reauthentication
  if (!stepUpTicket) {
    logger.info('Platform settings update invoked without step-up ticket - challenge issued', {
      actorId,
      action: 'MANAGE_PLATFORM_SETTINGS',
    });
    return {
      success: false,
      challengeRequired: true,
      challenge: createStepUpChallenge('MANAGE_PLATFORM_SETTINGS'),
    };
  }

  const isValidTicket = consumeStepUpTicket(
    stepUpTicket,
    actorId,
    'MANAGE_PLATFORM_SETTINGS'
  );

  if (!isValidTicket) {
    logger.warn('Platform settings update invoked with invalid or expired step-up ticket', {
      actorId,
      ticketId: stepUpTicket,
    });
    return {
      success: false,
      challengeRequired: true,
      challenge: createStepUpChallenge('MANAGE_PLATFORM_SETTINGS'),
    };
  }

  // 3. Schema Validation
  const validated = PlatformSettingsUpdateSchema.parse(input);

  const previousSettings = { ...activePlatformSettings };

  // 4. Mutation
  activePlatformSettings = {
    ...activePlatformSettings,
    ...(validated.platformName !== undefined ? { platformName: validated.platformName } : {}),
    ...(validated.logoUrl !== undefined ? { logoUrl: validated.logoUrl } : {}),
    ...(validated.supportEmail !== undefined ? { supportEmail: validated.supportEmail } : {}),
    ...(validated.supportPhone !== undefined ? { supportPhone: validated.supportPhone } : {}),
    ...(validated.defaultFeePercent !== undefined ? { defaultFeePercent: validated.defaultFeePercent } : {}),
    ...(validated.defaultReservePercent !== undefined ? { defaultReservePercent: validated.defaultReservePercent } : {}),
    ...(validated.emergencyKillswitch !== undefined ? { emergencyKillswitch: validated.emergencyKillswitch } : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: actorId,
  };

  logger.info('Platform settings updated successfully by Super Admin', {
    actorId,
    updatedFields: Object.keys(validated),
    emergencyKillswitch: activePlatformSettings.emergencyKillswitch,
  });

  // 5. Audit Logging
  if (auditRepo) {
    try {
      await auditRepo.createLog({
        company_id: '00000000-0000-7000-8000-000000000000', // Platform root
        actor_id: actorId,
        action: 'PLATFORM_SETTINGS_UPDATED',
        entity_type: 'platform_settings',
        entity_id: 'global',
        payload: {
          actor_role: actorRole,
          previous: previousSettings,
          updated: activePlatformSettings,
          changes: validated,
          clientIp: clientIp ?? '127.0.0.1',
        },
      });
    } catch (auditErr) {
      logger.error('Failed to log platform settings update audit event', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }
  }

  return {
    success: true,
    settings: { ...activePlatformSettings },
  };
}
