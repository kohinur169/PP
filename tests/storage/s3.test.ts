// path: tests/storage/s3.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { S3StorageAdapter } from '../../lib/storage/s3';
import {
  StorageError,
  StorageFileNotFoundError,
  StorageTenantAccessViolationError,
} from '../../lib/storage/types';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockImplementation(async (_client, command, options) => {
    const bucket = command.input.Bucket;
    const key = command.input.Key;
    const dl = command.input.ResponseContentDisposition ? '&' + command.input.ResponseContentDisposition : '';
    return `https://${bucket}.s3.amazonaws.com/${key}?X-Amz-Expires=${options.expiresIn}${dl}`;
  }),
}));

describe('Step 038: Amazon S3 Storage Adapter Implementation', () => {
  const companyAlpha = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  const companyBeta = '018f6c4c-3500-7fa1-b1e2-987654321def';

  let mockS3Client: S3Client;
  let adapter: S3StorageAdapter;
  let inMemoryBucket: Map<string, { body: Buffer; contentType: string; metadata?: Record<string, string> }>;

  beforeEach(() => {
    inMemoryBucket = new Map();

    mockS3Client = {
      send: vi.fn().mockImplementation(async (command: any) => {
        const cmdName = command.constructor.name;

        if (cmdName === 'PutObjectCommand') {
          inMemoryBucket.set(command.input.Key, {
            body: Buffer.from(command.input.Body),
            contentType: command.input.ContentType,
            metadata: command.input.Metadata,
          });
          return { ETag: '"mock-etag-12345"' };
        }

        if (cmdName === 'GetObjectCommand') {
          const item = inMemoryBucket.get(command.input.Key);
          if (!item) {
            const error = new Error('The specified key does not exist.');
            error.name = 'NoSuchKey';
            throw error;
          }
          return {
            Body: {
              transformToByteArray: async () => new Uint8Array(item.body),
            },
            ContentType: item.contentType,
            Metadata: item.metadata,
          };
        }

        if (cmdName === 'DeleteObjectCommand') {
          inMemoryBucket.delete(command.input.Key);
          return { DeleteMarker: true };
        }

        if (cmdName === 'HeadBucketCommand') {
          return {};
        }

        throw new Error(`Unhandled mock command: ${cmdName}`);
      }),
    } as unknown as S3Client;

    adapter = new S3StorageAdapter({
      bucketName: 'kd-s3-test-vault',
      s3Client: mockS3Client,
    });
  });

  describe('Upload & Path Segregation', () => {
    it('uploads file with tenant-isolated S3 key path and server-side encryption', async () => {
      const content = 'S3 KYC PASSPORT DOCUMENT BUFFER';
      const result = await adapter.uploadFile(content, {
        companyId: companyAlpha,
        category: 'kyc',
        filename: 'passport.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.companyId).toBe(companyAlpha);
      expect(result.category).toBe('kyc');
      expect(result.key).toContain(`companies/${companyAlpha}/kyc/`);
      expect(result.key.endsWith('_passport.jpg')).toBe(true);
      expect(result.sha256).toHaveLength(64);
      expect(inMemoryBucket.size).toBe(1);
    });
  });

  describe('Download & Tenant Isolation Verification', () => {
    it('downloads an existing object successfully for the authorized tenant', async () => {
      const upload = await adapter.uploadFile('S3 Stored Invoice', {
        companyId: companyAlpha,
        category: 'invoices',
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
      });

      const downloaded = await adapter.downloadFile(upload.key, companyAlpha);
      expect(downloaded.data.toString('utf8')).toBe('S3 Stored Invoice');
      expect(downloaded.contentType).toBe('application/pdf');
    });

    it('blocks cross-tenant access throwing StorageTenantAccessViolationError', async () => {
      const upload = await adapter.uploadFile('Confidential Alpha Data', {
        companyId: companyAlpha,
        category: 'kyc',
        filename: 'license.pdf',
      });

      // Company Beta attempting to download Company Alpha file
      await expect(adapter.downloadFile(upload.key, companyBeta)).rejects.toThrow(
        StorageTenantAccessViolationError
      );
    });

    it('maps NoSuchKey error to StorageFileNotFoundError', async () => {
      await expect(
        adapter.downloadFile(`companies/${companyAlpha}/kyc/non_existent.pdf`)
      ).rejects.toThrow(StorageFileNotFoundError);
    });
  });

  describe('Presigned URL Generation', () => {
    it('generates short-lived presigned URL with download options', async () => {
      const upload = await adapter.uploadFile('Branded Logo File', {
        companyId: companyAlpha,
        category: 'logos',
        filename: 'logo.svg',
      });

      const signed = await adapter.getSignedUrl(
        upload.key,
        {
          expiresInSeconds: 900,
          downloadFilename: 'merchant_logo.svg',
        },
        companyAlpha
      );

      expect(signed.signedUrl).toContain('kd-s3-test-vault.s3.amazonaws.com');
      expect(signed.signedUrl).toContain('X-Amz-Expires=900');
      expect(signed.signedUrl).toContain('merchant_logo.svg');
      expect(new Date(signed.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('blocks presigned URL creation for unauthorized tenants', async () => {
      const upload = await adapter.uploadFile('Protected Evidence', {
        companyId: companyAlpha,
        category: 'disputes',
        filename: 'evidence.png',
      });

      await expect(adapter.getSignedUrl(upload.key, undefined, companyBeta)).rejects.toThrow(
        StorageTenantAccessViolationError
      );
    });
  });

  describe('File Deletion & Health Checks', () => {
    it('deletes an asset from Amazon S3 bucket', async () => {
      const upload = await adapter.uploadFile('Delete S3 Data', {
        companyId: companyAlpha,
        category: 'exports',
        filename: 'report.csv',
      });

      expect(inMemoryBucket.size).toBe(1);
      const del = await adapter.deleteFile(upload.key, companyAlpha);

      expect(del.success).toBe(true);
      expect(inMemoryBucket.size).toBe(0);
    });

    it('reports Amazon S3 provider health and latency correctly', async () => {
      const health = await adapter.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('amazon-s3');
      expect(health.bucket).toBe('kd-s3-test-vault');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
