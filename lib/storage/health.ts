// path: lib/storage/health.ts

import crypto from 'node:crypto';
import type { FileEntity } from '../../types/file';
import { FileRepository } from '../db/files';
import type { StorageAdapter } from './types';
import { getStorageAdapter } from './index';
import { computeFileSha256, isFileEncrypted, decryptFileBuffer } from './file-encryption';
import { logger } from '../logger';

/**
 * Standard cron schedule expression for automated weekly storage integrity scans.
 * Runs every Sunday at 02:00 AM UTC.
 */
export const STORAGE_HEALTH_SCAN_CRON = '0 2 * * 0';

/**
 * Result of scanning an individual stored file asset.
 */
export interface StorageScanItemResult {
  readonly fileId: string;
  readonly companyId: string;
  readonly originalName: string;
  readonly category: string;
  readonly storagePath: string;
  readonly expectedHash: string;
  readonly actualHash?: string | undefined;
  readonly sizeBytes: number;
  readonly isEncrypted: boolean;
  readonly objectExists: boolean;
  readonly checksumMatches: boolean;
  readonly status: 'VERIFIED' | 'MISSING_OBJECT' | 'HASH_MISMATCH' | 'SHREDDED' | 'SKIPPED';
  readonly error?: string | undefined;
}

/**
 * Full summary health report detailing platform object storage state and integrity.
 */
export interface StorageHealthScanReport {
  readonly scanId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly totalFilesScanned: number;
  readonly verifiedCount: number;
  readonly missingCount: number;
  readonly mismatchCount: number;
  readonly shreddedCount: number;
  readonly totalStoredBytes: number;
  readonly totalStoredGigabytes: number;
  readonly isHealthy: boolean;
  readonly items: StorageScanItemResult[];
}

/**
 * Options for configuring a storage integrity scan.
 */
export interface StorageScanOptions {
  readonly fileRepo?: FileRepository | undefined;
  readonly storageAdapter?: StorageAdapter | undefined;
  readonly companyId?: string | undefined;
  readonly limit?: number | undefined;
  readonly sampleRate?: number | undefined;
  readonly includeShredded?: boolean | undefined;
}

/**
 * Step 045.1 & Step 045.2 & Step 045.3:
 * Scans file metadata records, verifies existence in cloud object storage,
 * downloads payloads, and computes SHA-256 checksums to detect bit rot or missing assets.
 */
export async function scanStorageIntegrity(
  options?: StorageScanOptions
): Promise<StorageHealthScanReport> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const scanId = `scan_${crypto.randomBytes(8).toString('hex')}`;

  const fileRepo = options?.fileRepo ?? new FileRepository();
  const storageAdapter = options?.storageAdapter ?? getStorageAdapter();

  // 1. Fetch file metadata candidates
  const allFiles = await fileRepo.findMany({
    companyId: options?.companyId,
    includeDeleted: options?.includeShredded ?? false,
    limit: options?.limit,
  });

  const items: StorageScanItemResult[] = [];
  let verifiedCount = 0;
  let missingCount = 0;
  let mismatchCount = 0;
  let shreddedCount = 0;
  let totalStoredBytes = 0;

  for (const file of allFiles) {
    // Check if shredded
    if (file.storage_path === '[SHREDDED_NO_STORAGE]' || file.original_name === '[CRYPTO_SHREDDED]') {
      shreddedCount++;
      items.push({
        fileId: file.id,
        companyId: file.company_id,
        originalName: file.original_name,
        category: file.category,
        storagePath: file.storage_path,
        expectedHash: file.file_hash,
        sizeBytes: 0,
        isEncrypted: file.is_encrypted,
        objectExists: false,
        checksumMatches: true,
        status: 'SHREDDED',
      });
      continue;
    }

    try {
      // Step 045.1: Verify object existence in cloud storage
      const downloadResult = await storageAdapter.downloadFile(
        file.storage_path,
        file.company_id
      );

      const downloadedBuffer = downloadResult.data;
      totalStoredBytes += downloadedBuffer.length;

      // Step 045.2: Download and calculate checksums, asserting equality
      let computedOriginalHash: string;
      let checksumMatches = false;

      if (file.is_encrypted && isFileEncrypted(downloadedBuffer)) {
        // Encrypted file: verify ciphertext and decrypt to verify plaintext SHA-256
        const decrypted = decryptFileBuffer(downloadedBuffer, file.company_id);
        computedOriginalHash = decrypted.originalHash;

        // Matches if original unencrypted hash matches database file_hash
        checksumMatches =
          computedOriginalHash.toLowerCase() === file.file_hash.toLowerCase();

        // Also check encrypted_hash if present
        if (file.encrypted_hash) {
          const encryptedRawHash = computeFileSha256(downloadedBuffer);
          if (encryptedRawHash.toLowerCase() !== file.encrypted_hash.toLowerCase()) {
            checksumMatches = false;
          }
        }
      } else {
        // Plaintext file: directly verify SHA-256
        computedOriginalHash = computeFileSha256(downloadedBuffer);
        checksumMatches =
          computedOriginalHash.toLowerCase() === file.file_hash.toLowerCase();
      }

      if (checksumMatches) {
        verifiedCount++;
        items.push({
          fileId: file.id,
          companyId: file.company_id,
          originalName: file.original_name,
          category: file.category,
          storagePath: file.storage_path,
          expectedHash: file.file_hash,
          actualHash: computedOriginalHash,
          sizeBytes: downloadedBuffer.length,
          isEncrypted: file.is_encrypted,
          objectExists: true,
          checksumMatches: true,
          status: 'VERIFIED',
        });
      } else {
        mismatchCount++;
        items.push({
          fileId: file.id,
          companyId: file.company_id,
          originalName: file.original_name,
          category: file.category,
          storagePath: file.storage_path,
          expectedHash: file.file_hash,
          actualHash: computedOriginalHash,
          sizeBytes: downloadedBuffer.length,
          isEncrypted: file.is_encrypted,
          objectExists: true,
          checksumMatches: false,
          status: 'HASH_MISMATCH',
          error: `Checksum mismatch: expected "${file.file_hash}", computed "${computedOriginalHash}". Possible bit rot detected!`,
        });
      }
    } catch (err: unknown) {
      missingCount++;
      items.push({
        fileId: file.id,
        companyId: file.company_id,
        originalName: file.original_name,
        category: file.category,
        storagePath: file.storage_path,
        expectedHash: file.file_hash,
        sizeBytes: file.size_bytes,
        isEncrypted: file.is_encrypted,
        objectExists: false,
        checksumMatches: false,
        status: 'MISSING_OBJECT',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const completedAtMs = Date.now();
  const completedAt = new Date(completedAtMs).toISOString();
  const durationMs = completedAtMs - startedAtMs;

  // Step 045.3: Generate health report detailing total stored gigabytes, missing objects, and verification status
  const totalStoredGigabytes = Number(
    (totalStoredBytes / (1024 * 1024 * 1024)).toFixed(6)
  );

  const isHealthy = missingCount === 0 && mismatchCount === 0;

  logger.info('Object storage integrity scan completed', {
    scanId,
    totalFilesScanned: allFiles.length,
    verifiedCount,
    missingCount,
    mismatchCount,
    totalStoredGigabytes,
    isHealthy,
  });

  return {
    scanId,
    startedAt,
    completedAt,
    durationMs,
    totalFilesScanned: allFiles.length,
    verifiedCount,
    missingCount,
    mismatchCount,
    shreddedCount,
    totalStoredBytes,
    totalStoredGigabytes,
    isHealthy,
    items,
  };
}
