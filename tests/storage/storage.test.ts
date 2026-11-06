// path: tests/storage/storage.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockStorageAdapter,
  buildStoragePath,
  sanitizeStorageFilename,
  extractCompanyIdFromPath,
  StorageFileNotFoundError,
  StorageTenantAccessViolationError,
} from '../../lib/storage';

describe('Step 036: Unified Object Storage Adapter Interface Specification', () => {
  let adapter: MockStorageAdapter;
  const companyAlpha = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  const companyBeta = '018f6c4c-3500-7fa1-b1e2-987654321def';

  beforeEach(() => {
    adapter = new MockStorageAdapter('test-kyc-bucket');
    adapter.clear();
  });

  describe('Storage Path Generation & Filename Sanitization', () => {
    it('sanitizes filenames stripping special characters and directory traversal patterns', () => {
      expect(sanitizeStorageFilename('../../../etc/passwd')).toBe('passwd');
      expect(sanitizeStorageFilename('passport scan 2026! (1).PDF')).toBe('passport_scan_2026_1_.pdf');
      expect(sanitizeStorageFilename('invoice#1234.pdf')).toBe('invoice_1234.pdf');
      expect(sanitizeStorageFilename('')).toBe('unnamed_file');
    });

    it('builds canonical tenant-isolated storage paths', () => {
      const path = buildStoragePath(companyAlpha, 'kyc', 'file_123', 'passport.pdf');
      expect(path).toBe(`companies/${companyAlpha}/kyc/file_123_passport.pdf`);
    });

    it('extracts owning tenant company ID from canonical storage path', () => {
      const path = `companies/${companyAlpha}/invoices/inv_001_december.pdf`;
      expect(extractCompanyIdFromPath(path)).toBe(companyAlpha);
      expect(extractCompanyIdFromPath('invalid/path/format')).toBeNull();
    });
  });

  describe('MockStorageAdapter Lifecycle (Upload, Download, Signed URL, Delete)', () => {
    it('uploads a file and verifies returned metadata and sha256 hash', async () => {
      const content = 'KYC PASSPORT DOCUMENT RAW CONTENT BUFFER';
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
      expect(result.sizeBytes).toBe(Buffer.byteLength(content));
      expect(result.sha256).toHaveLength(64);
      expect(adapter.getObjectCount()).toBe(1);
    });

    it('downloads an uploaded file with byte-level integrity', async () => {
      const fileData = Buffer.from('Binary invoice data 12345', 'utf8');
      const upload = await adapter.uploadFile(fileData, {
        companyId: companyAlpha,
        category: 'invoices',
        filename: 'invoice.pdf',
      });

      const downloaded = await adapter.downloadFile(upload.key);
      expect(downloaded.data.equals(fileData)).toBe(true);
      expect(downloaded.contentType).toBe('application/octet-stream');
    });

    it('generates short-lived signed URLs with expiration timestamps', async () => {
      const upload = await adapter.uploadFile('logo-data', {
        companyId: companyAlpha,
        category: 'logos',
        filename: 'logo.png',
      });

      const signed = await adapter.getSignedUrl(upload.key, {
        expiresInSeconds: 300,
        downloadFilename: 'custom_logo.png',
      });

      expect(signed.key).toBe(upload.key);
      expect(signed.signedUrl).toContain('test-kyc-bucket');
      expect(signed.signedUrl).toContain('download=custom_logo.png');
      expect(new Date(signed.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('deletes an uploaded file and decrements object count', async () => {
      const upload = await adapter.uploadFile('data', {
        companyId: companyAlpha,
        category: 'disputes',
        filename: 'evidence.png',
      });

      expect(adapter.getObjectCount()).toBe(1);
      const del = await adapter.deleteFile(upload.key);

      expect(del.success).toBe(true);
      expect(adapter.getObjectCount()).toBe(0);

      // Subsequent download throws StorageFileNotFoundError
      await expect(adapter.downloadFile(upload.key)).rejects.toThrow(StorageFileNotFoundError);
    });

    it('checks health and reports provider and latency', async () => {
      const health = await adapter.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('mock-in-memory');
      expect(health.bucket).toBe('test-kyc-bucket');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Tenant Path Segregation & Access Governance', () => {
    it('allows access when enforceCompanyId matches path owner', async () => {
      const upload = await adapter.uploadFile('sensitive-kyc-content', {
        companyId: companyAlpha,
        category: 'kyc',
        filename: 'id_front.jpg',
      });

      // Matching companyId succeeds
      const downloaded = await adapter.downloadFile(upload.key, companyAlpha);
      expect(downloaded.data.toString('utf8')).toBe('sensitive-kyc-content');

      const signed = await adapter.getSignedUrl(upload.key, undefined, companyAlpha);
      expect(signed.signedUrl).toBeDefined();

      const deleted = await adapter.deleteFile(upload.key, companyAlpha);
      expect(deleted.success).toBe(true);
    });

    it('strictly forbids cross-tenant asset access throwing StorageTenantAccessViolationError', async () => {
      const upload = await adapter.uploadFile('company-alpha-confidential-kyc', {
        companyId: companyAlpha,
        category: 'kyc',
        filename: 'passport.pdf',
      });

      // Company Beta attempting to access Company Alpha's file fails
      await expect(adapter.downloadFile(upload.key, companyBeta)).rejects.toThrow(
        StorageTenantAccessViolationError
      );

      await expect(adapter.getSignedUrl(upload.key, undefined, companyBeta)).rejects.toThrow(
        StorageTenantAccessViolationError
      );

      await expect(adapter.deleteFile(upload.key, companyBeta)).rejects.toThrow(
        StorageTenantAccessViolationError
      );
    });
  });

  describe('Fault Tolerance and Error Handling', () => {
    it('throws StorageFileNotFoundError when accessing non-existent keys', async () => {
      await expect(adapter.downloadFile('non/existent/key.pdf')).rejects.toThrow(
        StorageFileNotFoundError
      );
      await expect(adapter.getSignedUrl('non/existent/key.pdf')).rejects.toThrow(
        StorageFileNotFoundError
      );
      await expect(adapter.deleteFile('non/existent/key.pdf')).rejects.toThrow(
        StorageFileNotFoundError
      );
    });

    it('supports simulated upload failure for resilience testing', async () => {
      adapter.setFailNextUpload(true);

      await expect(
        adapter.uploadFile('fail-data', {
          companyId: companyAlpha,
          category: 'logos',
          filename: 'brand.svg',
        })
      ).rejects.toThrow('Simulated cloud storage network timeout during upload.');

      // Next upload succeeds normally
      const nextUpload = await adapter.uploadFile('retry-data', {
        companyId: companyAlpha,
        category: 'logos',
        filename: 'brand.svg',
      });
      expect(nextUpload.sizeBytes).toBeGreaterThan(0);
    });
  });
});
