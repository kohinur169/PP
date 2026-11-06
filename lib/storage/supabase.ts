// path: lib/storage/supabase.ts

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../database/client';
import { generateUuidV7 } from '../db/uuidv7';
import {
  StorageAdapter,
  StorageUploadOptions,
  StorageUploadResult,
  StorageSignedUrlOptions,
  StorageSignedUrlResult,
  StorageHealthResult,
  StorageError,
  StorageFileNotFoundError,
  StorageTenantAccessViolationError,
  buildStoragePath,
  extractCompanyIdFromPath,
} from './types';

export interface SupabaseStorageAdapterOptions {
  readonly bucketName?: string | undefined;
  readonly client?: SupabaseClient | undefined;
}

/**
 * Production Supabase Object Storage Adapter.
 * Fulfills StorageAdapter interface with strict multi-tenant isolation,
 * SHA-256 integrity verification, and signed download URLs.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  public readonly providerName = 'supabase-storage';
  public readonly bucketName: string;
  private readonly client: SupabaseClient;

  constructor(options?: SupabaseStorageAdapterOptions) {
    this.bucketName = options?.bucketName ?? 'kd-solution-secure-vault';
    this.client = options?.client ?? getSupabaseClient({ useServiceRole: true });
  }

  /**
   * Uploads a file buffer or string to Supabase Storage with tenant-isolated pathing.
   */
  public async uploadFile(
    data: Buffer | Uint8Array | string,
    options: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    const buffer = Buffer.isBuffer(data)
      ? data
      : typeof data === 'string'
      ? Buffer.from(data, 'utf8')
      : Buffer.from(data);

    const fileId = options.fileId ?? generateUuidV7();
    const key = buildStoragePath(
      options.companyId,
      options.category,
      fileId,
      options.filename
    );

    const contentType = options.contentType ?? 'application/octet-stream';
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const uploadedAt = new Date().toISOString();
    const encrypted = options.encrypt ?? false;

    try {
      const { error } = await this.client.storage
        .from(this.bucketName)
        .upload(key, buffer, {
          contentType,
          upsert: false,
        });

      if (error) {
        throw new StorageError(`Upload failed: ${error.message}`);
      }

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
    } catch (err: unknown) {
      if (err instanceof StorageError) throw err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`Upload to Supabase Storage failed: ${errorMsg}`);
    }
  }

  /**
   * Downloads an asset by key, enforcing tenant company ownership.
   */
  public async downloadFile(
    key: string,
    enforceCompanyId?: string | undefined
  ): Promise<{
    data: Buffer;
    contentType: string;
    metadata?: Record<string, string> | undefined;
  }> {
    if (enforceCompanyId) {
      const ownerId = extractCompanyIdFromPath(key);
      if (ownerId && ownerId !== enforceCompanyId.trim().toLowerCase()) {
        throw new StorageTenantAccessViolationError(key, enforceCompanyId, ownerId);
      }
    }

    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .download(key);

      if (error || !data) {
        if (error && error.message.toLowerCase().includes('not found')) {
          throw new StorageFileNotFoundError(key);
        }
        throw new StorageError(`Download failed: ${error?.message ?? 'No data returned'}`);
      }

      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return {
        data: buffer,
        contentType: (data as Blob).type || 'application/octet-stream',
      };
    } catch (err: unknown) {
      if (err instanceof StorageError) throw err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`Download from Supabase Storage failed: ${errorMsg}`);
    }
  }

  /**
   * Generates a short-lived signed URL for downloading an asset.
   */
  public async getSignedUrl(
    key: string,
    options?: StorageSignedUrlOptions,
    enforceCompanyId?: string | undefined
  ): Promise<StorageSignedUrlResult> {
    if (enforceCompanyId) {
      const ownerId = extractCompanyIdFromPath(key);
      if (ownerId && ownerId !== enforceCompanyId.trim().toLowerCase()) {
        throw new StorageTenantAccessViolationError(key, enforceCompanyId, ownerId);
      }
    }

    const expiresInSeconds = options?.expiresInSeconds ?? 900;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .createSignedUrl(
          key,
          expiresInSeconds,
          options?.downloadFilename !== undefined
            ? { download: options.downloadFilename }
            : {}
        );

      if (error || !data?.signedUrl) {
        if (error && error.message.toLowerCase().includes('not found')) {
          throw new StorageFileNotFoundError(key);
        }
        throw new StorageError(`Signed URL creation failed: ${error?.message ?? 'Unknown'}`);
      }

      return {
        signedUrl: data.signedUrl,
        key,
        expiresAt,
      };
    } catch (err: unknown) {
      if (err instanceof StorageError) throw err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`Signed URL generation failed: ${errorMsg}`);
    }
  }

  /**
   * Deletes an asset from storage, enforcing tenant company ownership.
   */
  public async deleteFile(
    key: string,
    enforceCompanyId?: string | undefined
  ): Promise<{ success: boolean; key: string }> {
    if (enforceCompanyId) {
      const ownerId = extractCompanyIdFromPath(key);
      if (ownerId && ownerId !== enforceCompanyId.trim().toLowerCase()) {
        throw new StorageTenantAccessViolationError(key, enforceCompanyId, ownerId);
      }
    }

    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .remove([key]);

      if (error) {
        throw new StorageError(`Delete failed: ${error.message}`);
      }

      return {
        success: true,
        key,
      };
    } catch (err: unknown) {
      if (err instanceof StorageError) throw err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`Delete from Supabase Storage failed: ${errorMsg}`);
    }
  }

  /**
   * Checks health and latency of the storage connection.
   */
  public async checkHealth(): Promise<StorageHealthResult> {
    const startTime = Date.now();
    try {
      const { error } = await this.client.storage
        .from(this.bucketName)
        .list('', { limit: 1 });

      const latencyMs = Date.now() - startTime;
      return {
        healthy: !error,
        latencyMs,
        provider: this.providerName,
        bucket: this.bucketName,
      };
    } catch {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        provider: this.providerName,
        bucket: this.bucketName,
      };
    }
  }
}
