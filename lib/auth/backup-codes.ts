// path: lib/auth/backup-codes.ts

import crypto from 'node:crypto';
import argon2 from 'argon2';
import type {
  BackupCodeGenerationResult,
  BackupCodeConsumptionResult,
} from '../../types/backup-codes';
import { UserBackupCodesRepository } from '../db/backup-codes';
import { AuditLogRepository } from '../db/audit';
import { logger } from '../logger';

// Non-ambiguous uppercase alphanumeric charset (excludes 0, O, 1, I, L)
const RECOVERY_CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const BACKUP_CODE_LENGTH = 8;
export const DEFAULT_BACKUP_CODES_COUNT = 10;

const defaultBackupRepo = new UserBackupCodesRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Checks if a string is a standard UUID.
 */
function isUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export interface BackupCodesOptions {
  readonly repo?: UserBackupCodesRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly companyId?: string | undefined;
  readonly fastHash?: boolean | undefined;
}

/**
 * Generates a single cryptographically random 8-character alphanumeric recovery code.
 * Formatted as 4-4 with hyphen: e.g. "7K9M-P2X4".
 */
export function generatePlainBackupCode(): string {
  const bytes = crypto.randomBytes(BACKUP_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    const byte = bytes[i]!;
    code += RECOVERY_CHARSET[byte % RECOVERY_CHARSET.length];
  }

  // Format as 4-4 with hyphen for human readability
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Generates an array of cryptographically random plain backup codes.
 */
export function generateBackupCodesList(
  count: number = DEFAULT_BACKUP_CODES_COUNT
): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generatePlainBackupCode());
  }
  return Array.from(codes);
}

/**
 * Normalizes user-submitted backup code:
 * strips whitespace and hyphens, and converts to uppercase.
 */
export function normalizeBackupCode(code: string): string {
  if (!code || typeof code !== 'string') return '';
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Computes an argon2id hash of a normalized backup code.
 */
export async function hashBackupCode(
  plainCode: string,
  options?: { fastHash?: boolean | undefined }
): Promise<string> {
  const normalized = normalizeBackupCode(plainCode);

  if (options?.fastHash) {
    // Fast SHA-256 fallback when explicitly selected for mock/test speed
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .createHash('sha256')
      .update(`${salt}:${normalized}`)
      .digest('hex');
    return `sha256:${salt}:${hash}`;
  }

  return await argon2.hash(normalized, {
    type: argon2.argon2id,
    memoryCost: 16384, // 16 MB
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifies a plain backup code against a stored hash.
 */
export async function verifyBackupCodeHash(
  plainCode: string,
  storedHash: string
): Promise<boolean> {
  const normalized = normalizeBackupCode(plainCode);

  if (storedHash.startsWith('sha256:')) {
    const parts = storedHash.split(':');
    const salt = parts[1];
    const expected = parts[2];
    if (!salt || !expected) return false;
    const computed = crypto
      .createHash('sha256')
      .update(`${salt}:${normalized}`)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  }

  try {
    return await argon2.verify(storedHash, normalized);
  } catch {
    return false;
  }
}

/**
 * Step 053.2: Generates 10 cryptographically random 8-character backup codes,
 * stores argon2id hashes in user_backup_codes, and returns plain codes to user.
 */
export async function generateBackupCodes(
  userId: string,
  options?: BackupCodesOptions
): Promise<BackupCodeGenerationResult> {
  const repo = options?.repo ?? defaultBackupRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const plainCodes = generateBackupCodesList(DEFAULT_BACKUP_CODES_COUNT);

  // Compute secure hashes in parallel
  const hashedCodes = await Promise.all(
    plainCodes.map((code) => hashBackupCode(code, { fastHash: options?.fastHash }))
  );

  // Invalidate any existing codes
  await repo.invalidateAllForUser(userId);

  // Store new hashes in database
  await repo.storeHashedCodes(userId, hashedCodes, options?.companyId);

  // Write immutable audit log
  const actorId = isUuid(userId) ? userId : null;
  await auditRepo.append({
    action: 'BACKUP_CODES_GENERATED',
    entity_type: 'user',
    entity_id: userId,
    actor_id: actorId,
    diff_payload: {
      before: null,
      after: { active_codes_count: DEFAULT_BACKUP_CODES_COUNT },
      changed_fields: ['backup_codes'],
    },
    payload: {
      userId,
      count: DEFAULT_BACKUP_CODES_COUNT,
      generatedAt: new Date().toISOString(),
    },
  });

  logger.info('10 fresh 2FA backup codes generated and stored for user', {
    userId,
    count: DEFAULT_BACKUP_CODES_COUNT,
  });

  return {
    plainCodes,
    count: DEFAULT_BACKUP_CODES_COUNT,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Step 053.3: Verifies single-use backup code against stored hashes,
 * marks used in database, and prevents replay attacks.
 */
export async function verifyAndConsumeBackupCode(
  userId: string,
  inputCode: string,
  options?: BackupCodesOptions
): Promise<BackupCodeConsumptionResult> {
  const repo = options?.repo ?? defaultBackupRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const normalized = normalizeBackupCode(inputCode);
  if (normalized.length !== BACKUP_CODE_LENGTH) {
    logger.warn('Backup code verification failed: invalid length', {
      userId,
      length: normalized.length,
    });
    return {
      valid: false,
      error: `Backup recovery code must be exactly ${BACKUP_CODE_LENGTH} alphanumeric characters.`,
    };
  }

  // Fetch only unused, active codes for this user
  const activeRecords = await repo.findActiveByUserId(userId);

  if (activeRecords.length === 0) {
    logger.warn('Backup code verification rejected: no active backup codes remaining', {
      userId,
    });
    return {
      valid: false,
      error: 'No active backup recovery codes found. Please contact support for an administrative 2FA reset.',
    };
  }

  // Check input against active hashes
  for (const record of activeRecords) {
    const matches = await verifyBackupCodeHash(normalized, record.code_hash);
    if (matches) {
      // Mark code used in database to prevent replay
      await repo.markUsed(record.id, record.version);

      const remainingCount = activeRecords.length - 1;

      // Audit log the single-use consumption
      const actorId = isUuid(userId) ? userId : null;
      await auditRepo.append({
        action: 'BACKUP_CODE_CONSUMED',
        entity_type: 'user',
        entity_id: userId,
        actor_id: actorId,
        diff_payload: {
          before: { used_at: null },
          after: { used_at: new Date().toISOString(), remaining_count: remainingCount },
          changed_fields: ['used_at'],
        },
        payload: {
          userId,
          consumedCodeId: record.id,
          remainingCodesCount: remainingCount,
          consumedAt: new Date().toISOString(),
        },
      });

      logger.info('2FA backup recovery code consumed successfully', {
        userId,
        codeId: record.id,
        remainingCount,
      });

      return {
        valid: true,
        codeId: record.id,
        remainingCount,
      };
    }
  }

  logger.warn('Backup code verification failed: hash mismatch or code already consumed', {
    userId,
  });

  return {
    valid: false,
    error: 'Invalid or already consumed backup recovery code.',
  };
}

export const verifyAndConsumeUserBackupCode = verifyAndConsumeBackupCode;

/**
 * Step 053.4: Regenerates 10 fresh backup codes from settings,
 * invalidating all previous codes and resetting active count to 10.
 */
export async function regenerateBackupCodes(
  userId: string,
  options?: BackupCodesOptions
): Promise<BackupCodeGenerationResult> {
  logger.info('Regenerating 2FA backup codes for user - invalidating old codes', {
    userId,
  });

  return await generateBackupCodes(userId, options);
}

/**
 * Returns the count of unused active backup recovery codes remaining for a user.
 */
export async function getActiveBackupCodesCount(
  userId: string,
  options?: { readonly repo?: UserBackupCodesRepository | undefined }
): Promise<number> {
  const repo = options?.repo ?? defaultBackupRepo;
  return await repo.countActiveForUser(userId);
}
