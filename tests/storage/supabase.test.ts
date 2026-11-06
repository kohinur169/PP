// path: tests/storage/supabase.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStorageAdapter } from '../../lib/storage/supabase';
import {
  StorageError,
  StorageFileNotFoundError,
  StorageTenantAccessViolationError,
} from '../../lib/storage/types';

describe('Step 037: Supabase Storage Adapter Implementation', () => {
  const companyAlpha = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  const companyBeta = '018f6c4c-3500-7fa1-b1e2-987654321def';

  let mockClient: SupabaseClient;
  let adapter: SupabaseStorageAdapter;
  let inMemoryBucket: Map<string, { data: Buffer; contentType: string }>;

  beforeEach(() => {
    inMemoryBucket = new Map();

    const mockStorage = {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockImplementation(async (path: string, file: Buffer, options: any) => {
          inMemoryBucket.set(path, {
            data: Buffer.from(file),
            contentType: options?.contentType ?? 'application/octet-stream',
          });
          return { data: { path }, error: null };
        }),
        download: vi.fn().mockImplementation(async (path: string) => {
          const item = inMemoryBucket.get(path);
          if (!item) {
            return { data: null, error: { message: 'Object not found' } };
          }
          const slice = item.data.buffer.slice(
            item.data.byteOffset,
            item.data.byteOffset + item.data.byteLength
          );
          const blob = {
            arrayBuffer: async () => slice,
            type: item.contentType,
          };
          return { data: blob, error: null };
        }),
        createSignedUrl: vi.fn().mockImplementation(async (path: string, expiresIn: number, opts: any) => {
          if (!inMemoryBucket.has(path)) {
            return { data: null, error: { message: 'Object not found' } };
          }
          const dl = opts?.download ? `&download=${opts.download}` : '';
          return {
            data: {
              signedUrl: `https://supabase.co/storage/v1/signed/test-vault/${path}?token=sig123&expires=${expiresIn}${dl}`,
            },
            error: null,
          };
        }),
        remove: vi.fn().mockImplementation(async (paths: string[]) => {
          for (const p of paths) inMemoryBucket.delete(p);
          return { data: paths, error: null };
        }),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    mockClient = {
      storage: mockStorage,
    } as unknown as SupabaseClient;

    adapter = new SupabaseStorageAdapter({
      bucketName: 'test-vault',
      client: mockClient,
    });
  });

  describe('Upload & Path Segregation', () => {
    it('uploads file with tenant-isolated path and SHA-256 verification', async () => {
      const content = 'KYC PASSPORT DOCUMENT BUFFER';
      const result = await adapter.uploadFile(content, {
        companyId: companyAlpha,
        category: 'kyc',
        filename: 'passport.pdf',
        contentType: 'application/pdf',
      });

      expect(result.companyId).toBe(companyAlpha);
      expect(result.category).toBe('kyc');
      expect(result.key).toContain(`companies/${companyAlpha}/kyc/`);
      expect(result.key.endsWith('_passport.pdf')).toBe(true);
      expect(result.sha256).toHaveLength(64);
      expect(inMemoryBucket.size).toBe(1);
    });
  });

  describe('Download & Tenant Isolation Verification', () => {
    it('downloads an existing object successfully for the authorized tenant', async () => {
      const upload = await adapter.uploadFile('Confidential Agreement', {
        companyId: companyAlpha,
        category: 'invoices',
        filename: 'agreement.txt',
        contentType: 'text/plain',
      });

      const downloaded = await adapter.downloadFile(upload.key, companyAlpha);
      expect(downloaded.data.toString('utf8')).toBe('Confidential Agreement');
      expect(downloaded.contentType).toBe('text/plain');
    });

    it('blocks cross-tenant access throwing StorageTenantAccessViolationError', async () => {
      const upload = await adapter.uploadFile('Secret Beta Data', {
        companyId: companyAlpha,
        category: 'kyc',
        filename: 'doc.pdf',
      });

      // Company Beta attempting to download Company Alpha file
      await expect(adapter.downloadFile(upload.key, companyBeta)).rejects.toThrow(
        StorageTenantAccessViolationError
      );
    });

    it('maps 404 not found to StorageFileNotFoundError', async () => {
      await expect(
        adapter.downloadFile(`companies/${companyAlpha}/kyc/non_existent.pdf`)
      ).rejects.toThrow(StorageFileNotFoundError);
    });
  });

  describe('Signed URL Generation', () => {
    it('generates short-lived signed URL with download options', async () => {
      const upload = await adapter.uploadFile('File Data', {
        companyId: companyAlpha,
        category: 'logos',
        filename: 'logo.png',
      });

      const signed = await adapter.getSignedUrl(
        upload.key,
        {
          expiresInSeconds: 600,
          downloadFilename: 'merchant_logo.png',
        },
        companyAlpha
      );

      expect(signed.signedUrl).toContain('test-vault');
      expect(signed.signedUrl).toContain('download=merchant_logo.png');
      expect(new Date(signed.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('blocks signed URL creation for unauthorized tenants', async () => {
      const upload = await adapter.uploadFile('Protected File', {
        companyId: companyAlpha,
        category: 'disputes',
        filename: 'proof.png',
      });

      await expect(adapter.getSignedUrl(upload.key, undefined, companyBeta)).rejects.toThrow(
        StorageTenantAccessViolationError
      );
    });
  });

  describe('File Deletion & Health Checks', () => {
    it('deletes an asset and removes it from storage', async () => {
      const upload = await adapter.uploadFile('Delete Me', {
        companyId: companyAlpha,
        category: 'exports',
        filename: 'temp.csv',
      });

      expect(inMemoryBucket.size).toBe(1);
      const del = await adapter.deleteFile(upload.key, companyAlpha);

      expect(del.success).toBe(true);
      expect(inMemoryBucket.size).toBe(0);
    });

    it('reports health and latency correctly', async () => {
      const health = await adapter.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('supabase-storage');
      expect(health.bucket).toBe('test-vault');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
