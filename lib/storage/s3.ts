// path: lib/storage/s3.ts

import crypto from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';
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

export interface S3StorageAdapterOptions {
  readonly region?: string | undefined;
  readonly bucketName?: string | undefined;
  readonly s3Client?: S3Client | undefined;
  readonly credentials?: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  } | undefined;
}

/**
 * Production Amazon S3 Object Storage Adapter.
 * Fulfills StorageAdapter interface using AWS SDK v3 with server-side encryption,
 * tenant-isolated keys, and presigned GET URLs.
 */
export class S3StorageAdapter implements StorageAdapter {
  public readonly providerName = 'amazon-s3';
  public readonly bucketName: string;
  private readonly client: S3Client;

  constructor(options?: S3StorageAdapterOptions) {
    this.bucketName =
      options?.bucketName ??
      process.env.AWS_S3_BUCKET ??
      'kd-solution-secure-vault';

    if (options?.s3Client) {
      this.client = options.s3Client;
    } else {
      const region = options?.region ?? process.env.AWS_REGION ?? 'ap-southeast-1';
      const accessKeyId =
        options?.credentials?.accessKeyId ??
        process.env.AWS_ACCESS_KEY_ID ??
        'test_access_key';
      const secretAccessKey =
        options?.credentials?.secretAccessKey ??
        process.env.AWS_SECRET_ACCESS_KEY ??
        'test_secret_key';

      this.client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
  }

  /**
   * Uploads a file buffer or string to Amazon S3 with server-side encryption.
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

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        ...(options.metadata ?? {}),
        sha256,
        category: options.category,
        company_id: options.companyId,
      },
    });

    try {
      await this.client.send(command);

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
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`Upload to Amazon S3 failed: ${errorMsg}`);
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

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const response = await this.client.send(command);

      if (!response.Body) {
        throw new StorageError(`GetObject returned empty response body for key: ${key}`);
      }

      const byteArray = await response.Body.transformToByteArray();
      const buffer = Buffer.from(byteArray);

      return {
        data: buffer,
        contentType: response.ContentType ?? 'application/octet-stream',
        metadata: response.Metadata,
      };
    } catch (err: unknown) {
      if (err instanceof StorageError) throw err;
      const errorName = (err as { name?: string })?.name ?? '';
      if (errorName === 'NoSuchKey' || errorName === 'NotFound') {
        throw new StorageFileNotFoundError(key);
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`Download from Amazon S3 failed: ${errorMsg}`);
    }
  }

  /**
   * Generates a short-lived presigned GET URL for downloading an asset.
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

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ResponseContentDisposition: options?.downloadFilename
        ? `attachment; filename="${options.downloadFilename}"`
        : undefined,
    });

    try {
      const signedUrl = await awsGetSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        signedUrl,
        key,
        expiresAt,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`Presigned URL generation failed: ${errorMsg}`);
    }
  }

  /**
   * Deletes an asset from Amazon S3, enforcing tenant company ownership.
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

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.client.send(command);

      return {
        success: true,
        key,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new StorageError(`Delete from Amazon S3 failed: ${errorMsg}`);
    }
  }

  /**
   * Checks health and latency of the S3 bucket connection.
   */
  public async checkHealth(): Promise<StorageHealthResult> {
    const startTime = Date.now();
    try {
      const command = new HeadBucketCommand({
        Bucket: this.bucketName,
      });
      await this.client.send(command);

      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
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
