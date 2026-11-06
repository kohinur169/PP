// path: lib/storage/mock.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '../db/uuidv7';
import {
  StorageAdapter,
  StorageUploadOptions,
  StorageUploadResult,
  StorageSignedUrlOptions,
  StorageSignedUrlResult,
  StorageHealthResult,
  StorageFileNotFoundError,
  StorageTenantAccessViolationError,
  buildStoragePath,
  extractCompanyIdFromPath,
} from './types';

interface StoredObject {
  readonly data: Buffer;
  readonly contentType: string;
  readonly metadata?: Record<string, string> | undefined;
  readonly sha256: string;
  readonly uploadedAt: string;
  readonly encrypted: boolean;
}

/**
 * In-Memory Mock Storage Adapter.
 * Fulfills StorageAdapter interface with 100% fidelity for unit tests, CI pipelines, and offline development.
 */
export class MockStorageAdapter implements StorageAdapter {
  public readonly providerName = 'mock-in-memory';
  public readonly bucketName: string;
  private readonly storage = new Map<string, StoredObject>();
  private simulatedLatencyMs = 0;
  private failNextUpload = false;

  constructor(bucketName: string = 'kd-solution-mock-bucket') {
    this.bucketName = bucketName;
  }

  /**
   * Clears all in-memory stored objects.
   */
  public clear(): void {
    this.storage.clear();
  }

  /**
   * Sets simulated network latency in milliseconds.
   */
  public setSimulatedLatency(ms: number): void {
    this.simulatedLatencyMs = ms;
  }

  /**
   * Injects an error into the next upload call for fault tolerance testing.
   */
  public setFailNextUpload(fail: boolean): void {
    this.failNextUpload = fail;
  }

  /**
   * Returns count of currently stored objects.
   */
  public getObjectCount(): number {
    return this.storage.size;
  }

  private async simulateLatency(): Promise<void> {
    if (this.simulatedLatencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulatedLatencyMs));
    }
  }

  public async uploadFile(
    data: Buffer | Uint8Array | string,
    options: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    await this.simulateLatency();

    if (this.failNextUpload) {
      this.failNextUpload = false;
      throw new Error('Simulated cloud storage network timeout during upload.');
    }

    const buffer = Buffer.isBuffer(data)
      ? data
      : typeof data === 'string'
      ? Buffer.from(data, 'utf8')
      : Buffer.from(data);

    const fileId = options.fileId ?? generateUuidV7();
    const key = buildStoragePath(options.companyId, options.category, fileId, options.filename);

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const contentType = options.contentType ?? 'application/octet-stream';
    const uploadedAt = new Date().toISOString();
    const encrypted = options.encrypt ?? false;

    this.storage.set(key, {
      data: buffer,
      contentType,
      metadata: options.metadata,
      sha256,
      uploadedAt,
      encrypted,
    });

    return {
      key,
      fileId,
      companyId: options.companyId,
      category: options.category,
      sizeBytes: buffer.length,
      contentType,
      sha256,
      encrypted,
      uploadedAt,
    };
  }

  public async downloadFile(
    key: string,
    enforceCompanyId?: string | undefined
  ): Promise<{
    data: Buffer;
    contentType: string;
    metadata?: Record<string, string> | undefined;
  }> {
    await this.simulateLatency();

    if (enforceCompanyId) {
      const ownerId = extractCompanyIdFromPath(key);
      if (ownerId && ownerId !== enforceCompanyId.trim().toLowerCase()) {
        throw new StorageTenantAccessViolationError(key, enforceCompanyId, ownerId);
      }
    }

    const item = this.storage.get(key);
    if (!item) {
      throw new StorageFileNotFoundError(key);
    }

    return {
      data: Buffer.from(item.data), // Return defensive copy
      contentType: item.contentType,
      metadata: item.metadata,
    };
  }

  public async getSignedUrl(
    key: string,
    options?: StorageSignedUrlOptions,
    enforceCompanyId?: string | undefined
  ): Promise<StorageSignedUrlResult> {
    await this.simulateLatency();

    if (enforceCompanyId) {
      const ownerId = extractCompanyIdFromPath(key);
      if (ownerId && ownerId !== enforceCompanyId.trim().toLowerCase()) {
        throw new StorageTenantAccessViolationError(key, enforceCompanyId, ownerId);
      }
    }

    if (!this.storage.has(key)) {
      throw new StorageFileNotFoundError(key);
    }

    const expiresInSeconds = options?.expiresInSeconds ?? 900;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const downloadQuery = options?.downloadFilename
      ? `&download=${encodeURIComponent(options.downloadFilename)}`
      : '';

    const signedUrl = `https://storage.kdsolution.it/${this.bucketName}/${key}?token=mock_sig_${Date.now()}&expires=${expiresAt}${downloadQuery}`;

    return {
      signedUrl,
      key,
      expiresAt,
    };
  }

  public async deleteFile(
    key: string,
    enforceCompanyId?: string | undefined
  ): Promise<{ success: boolean; key: string }> {
    await this.simulateLatency();

    if (enforceCompanyId) {
      const ownerId = extractCompanyIdFromPath(key);
      if (ownerId && ownerId !== enforceCompanyId.trim().toLowerCase()) {
        throw new StorageTenantAccessViolationError(key, enforceCompanyId, ownerId);
      }
    }

    const existed = this.storage.delete(key);
    if (!existed) {
      throw new StorageFileNotFoundError(key);
    }

    return { success: true, key };
  }

  public async checkHealth(): Promise<StorageHealthResult> {
    const startTime = Date.now();
    await this.simulateLatency();
    const latencyMs = Date.now() - startTime;

    return {
      healthy: true,
      latencyMs,
      provider: this.providerName,
      bucket: this.bucketName,
    };
  }
}
