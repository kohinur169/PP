// path: lib/storage/retention.ts

import type { FileEntity, FileCategory } from '../../types/file';
import { FileRepository } from '../db/files';
import { AuditLogRepository } from '../db/audit';
import type { StorageAdapter } from './types';
import { getStorageAdapter } from './index';
import { logger } from '../logger';

/**
 * Seven-year statutory retention duration in milliseconds.
 * Mandated by Bank Secrecy Act (BSA), FinCEN AML, IRS tax regulations, and card network dispute rules.
 * 7 years * 365.25 days/year * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
 */
export const SEVEN_YEARS_MS = 7 * 365.25 * 24 * 60 * 60 * 1000;

/**
 * File categories strictly protected by the 7-year regulatory retention mandate.
 */
export const RETENTION_MANDATED_CATEGORIES = new Set<FileCategory>([
  'kyc',
  'invoice',
  'dispute',
]);

/**
 * Non-mandated document categories eligible for standard merchant lifecycle deletion.
 */
export const VOLATILE_CATEGORIES = new Set<FileCategory>([
  'logo',
  'export',
  'general',
]);

/**
 * Thrown when an actor attempts permanent deletion or crypto-shredding of a file
 * before its 7-year statutory retention period has elapsed.
 */
export class RetentionViolationError extends Error {
  public readonly fileId: string;
  public readonly category: string;
  public readonly retentionExpiresAt: string;
  public readonly daysRemaining: number;

  constructor(
    fileId: string,
    category: string,
    retentionExpiresAt: string,
    daysRemaining: number
  ) {
    super(
      `[Regulatory Retention Guard] Document category "${category}" for file "${fileId}" is strictly protected by statutory 7-year compliance retention until "${retentionExpiresAt}" (${daysRemaining} day(s) remaining). Permanent deletion and crypto-shredding are strictly prohibited.`
    );
    this.name = 'RetentionViolationError';
    this.fileId = fileId;
    this.category = category;
    this.retentionExpiresAt = retentionExpiresAt;
    this.daysRemaining = daysRemaining;
  }
}

/**
 * Status report returned when evaluating a file's regulatory retention status.
 */
export interface FileRetentionStatus {
  readonly fileId: string;
  readonly category: FileCategory;
  readonly isMandated: boolean;
  readonly createdAt: string;
  readonly retentionExpiresAt: string;
  readonly isRetentionActive: boolean;
  readonly daysRemaining: number;
  readonly eligibleForCryptoShredding: boolean;
  readonly summary: string;
}

/**
 * Input options for soft-deleting a file record.
 */
export interface SoftDeleteFileOptions {
  readonly fileId: string;
  readonly actorId: string;
  readonly userRole?: string | undefined;
  readonly userCompanyId?: string | undefined;
  readonly reason?: string | undefined;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

/**
 * Input options for permanently crypto-shredding a file and destroying key material.
 */
export interface CryptoShredFileOptions {
  readonly fileId: string;
  readonly actorId: string;
  readonly userRole?: string | undefined;
  readonly userCompanyId?: string | undefined;
  readonly isSuperadmin?: boolean | undefined;
  readonly reason?: string | undefined;
  readonly courtOrderReference?: string | undefined;
  readonly forceOverrideWithCourtOrder?: boolean | undefined;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
  readonly now?: number | undefined;
}

/**
 * Result returned following crypto-shredding execution.
 */
export interface CryptoShredResult {
  readonly fileId: string;
  readonly companyId: string;
  readonly category: FileCategory;
  readonly storagePath: string;
  readonly shreddedAt: string;
  readonly storageObjectDeleted: boolean;
  readonly metadataZeroed: boolean;
  readonly auditLogRecorded: boolean;
}

/**
 * Injectable repository dependencies for testing and modular execution.
 */
export interface RetentionDependencies {
  readonly fileRepo?: FileRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly storageAdapter?: StorageAdapter | undefined;
}

/**
 * Step 044.2: Evaluates a file's statutory retention status and compliance constraints.
 */
export function checkFileRetentionPolicy(
  file: FileEntity,
  now = Date.now()
): FileRetentionStatus {
  const isMandated = RETENTION_MANDATED_CATEGORIES.has(file.category);
  const createdTimestamp = new Date(file.created_at).getTime();
  const expiresTimestamp = createdTimestamp + SEVEN_YEARS_MS;
  const retentionExpiresAt = new Date(expiresTimestamp).toISOString();

  const isRetentionActive = isMandated && now < expiresTimestamp;
  const diffMs = Math.max(0, expiresTimestamp - now);
  const daysRemaining = isRetentionActive ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
  const eligibleForCryptoShredding = !isRetentionActive;

  let summary = `Category "${file.category}" is non-statutory and may be safely shredded.`;
  if (isRetentionActive) {
    summary = `Category "${file.category}" must be retained until ${retentionExpiresAt} (${daysRemaining} days remaining).`;
  } else if (isMandated && !isRetentionActive) {
    summary = `Category "${file.category}" has satisfied its 7-year regulatory retention mandate and is eligible for shredding.`;
  }

  return {
    fileId: file.id,
    category: file.category,
    isMandated,
    createdAt: file.created_at,
    retentionExpiresAt,
    isRetentionActive,
    daysRemaining,
    eligibleForCryptoShredding,
    summary,
  };
}

/**
 * Helper validating UUID format for audit log actor_id.
 */
function isUuid(val?: string | null): boolean {
  if (!val) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
}

/**
 * Step 044.1: Soft-deletes a file record by marking `deleted_at` timestamp.
 * Preserves physical cloud storage object and cryptographic metadata for legal hold.
 */
export async function softDeleteFile(
  options: SoftDeleteFileOptions,
  deps?: RetentionDependencies
): Promise<FileEntity> {
  const fileRepo = deps?.fileRepo ?? new FileRepository();
  const auditRepo = deps?.auditRepo ?? new AuditLogRepository();

  const file = await fileRepo.findById(options.fileId);
  if (!file) {
    throw new Error(`[Secure Storage] File not found: "${options.fileId}".`);
  }

  if (file.deleted_at !== null) {
    // Already soft-deleted
    return file;
  }

  // Tenant boundary check
  if (
    options.userCompanyId &&
    options.userCompanyId !== file.company_id &&
    options.userRole !== 'super_admin'
  ) {
    throw new Error(
      `[Tenant Isolation] User company "${options.userCompanyId}" cannot delete file belonging to company "${file.company_id}".`
    );
  }

  // Execute soft-deletion with optimistic concurrency control
  const updated = await fileRepo.softDeleteFile(file.id, file.version);

  // Record audit trail
  await auditRepo.append({
    action: 'FILE_DELETED',
    entity_type: 'file',
    entity_id: file.id,
    actor_id: isUuid(options.actorId) ? options.actorId : null,
    company_id: file.company_id,
    ip_address: options.ipAddress ?? null,
    user_agent: options.userAgent ?? null,
    payload: {
      fileId: file.id,
      actorUserId: options.actorId,
      originalName: file.original_name,
      category: file.category,
      storagePath: file.storage_path,
      deletionType: 'soft_delete',
      reason: options.reason ?? 'User or automated soft deletion request',
    },
  });

  logger.info('File soft-deleted successfully', {
    fileId: file.id,
    companyId: file.company_id,
    actorId: options.actorId,
  });

  return updated;
}

/**
 * Step 044.3: Permanently crypto-shreds a file:
 * 1. Checks 7-year regulatory retention mandate (rejects if active).
 * 2. Deletes physical storage object from cloud provider.
 * 3. Overwrites and zeroes database metadata and hashes.
 * 4. Logs immutable FILE_DELETED (crypto-shredded) audit entry.
 */
export async function cryptoShredFile(
  options: CryptoShredFileOptions,
  deps?: RetentionDependencies
): Promise<CryptoShredResult> {
  const fileRepo = deps?.fileRepo ?? new FileRepository();
  const auditRepo = deps?.auditRepo ?? new AuditLogRepository();

  const file = await fileRepo.findById(options.fileId);
  if (!file) {
    throw new Error(`[Secure Storage] File not found: "${options.fileId}".`);
  }

  // 1. Evaluate regulatory retention policy
  const retention = checkFileRetentionPolicy(file, options.now ?? Date.now());

  if (retention.isRetentionActive) {
    const isCourtOrderOverride =
      options.forceOverrideWithCourtOrder === true &&
      Boolean(options.courtOrderReference) &&
      (options.isSuperadmin === true || options.userRole === 'super_admin');

    if (!isCourtOrderOverride) {
      throw new RetentionViolationError(
        file.id,
        file.category,
        retention.retentionExpiresAt,
        retention.daysRemaining
      );
    }

    logger.warn('Statutory 7-year retention overridden by certified court order', {
      fileId: file.id,
      courtOrderReference: options.courtOrderReference,
      actorId: options.actorId,
    });
  }

  // 2. Delete physical storage object from cloud provider
  const storageAdapter =
    deps?.storageAdapter ?? getStorageAdapter(file.storage_provider);

  let storageDeleted = false;
  try {
    await storageAdapter.deleteFile(file.storage_path, file.company_id);
    storageDeleted = true;
  } catch (err: unknown) {
    logger.warn('Object storage delete warning during crypto-shredding', {
      fileId: file.id,
      storagePath: file.storage_path,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Crypto-shred database metadata: zero hashes and replace sensitive references
  const shreddedAt = new Date().toISOString();
  const zeroedHash = '0'.repeat(64);

  const updated = await fileRepo.update(file.id, file.version, {
    original_name: '[CRYPTO_SHREDDED]',
    file_hash: zeroedHash,
    encrypted_hash: null,
    storage_path: '[SHREDDED_NO_STORAGE]',
    size_bytes: 0,
  });

  // If not already marked as deleted, perform soft-deletion
  if (file.deleted_at === null) {
    await fileRepo.softDeleteFile(file.id, updated.version);
  }

  // 4. Record audit log
  await auditRepo.append({
    action: 'FILE_DELETED',
    entity_type: 'file',
    entity_id: file.id,
    actor_id: isUuid(options.actorId) ? options.actorId : null,
    company_id: file.company_id,
    ip_address: options.ipAddress ?? null,
    user_agent: options.userAgent ?? null,
    payload: {
      fileId: file.id,
      actorUserId: options.actorId,
      companyId: file.company_id,
      category: file.category,
      storageProvider: file.storage_provider,
      storagePath: file.storage_path,
      deletionType: 'crypto_shred',
      courtOrderReference: options.courtOrderReference ?? null,
      reason: options.reason ?? 'Permanent crypto-shredding following statutory retention completion',
      shreddedAt,
    },
  });

  logger.info('File crypto-shredded and storage object purged', {
    fileId: file.id,
    companyId: file.company_id,
    actorId: options.actorId,
    shreddedAt,
  });

  return {
    fileId: file.id,
    companyId: file.company_id,
    category: file.category,
    storagePath: file.storage_path,
    shreddedAt,
    storageObjectDeleted: storageDeleted,
    metadataZeroed: true,
    auditLogRecorded: true,
  };
}
