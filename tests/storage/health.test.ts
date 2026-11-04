// path: tests/storage/health.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  scanStorageIntegrity,
  STORAGE_HEALTH_SCAN_CRON,
} from '../../lib/storage/health';
import { FileRepository } from '../../lib/db/files';
import { MockStorageAdapter } from '../../lib/storage/mock';
import { encryptFileBuffer, computeFileSha256 } from '../../lib/storage/file-encryption';

describe('Step 045: Storage Integrity Scanner & Health Checker Utility', () => {
  let fileRepo: FileRepository;
  let mockStorage: MockStorageAdapter;

  const companyId = '018f6c4c-3500-7fa1-b1e2-000000000045';

  beforeEach(() => {
    fileRepo = new FileRepository();
    mockStorage = new MockStorageAdapter('health-vault');
  });

  it('verifies automated weekly cron schedule configuration', () => {
    expect(STORAGE_HEALTH_SCAN_CRON).toBe('0 2 * * 0');
  });

  describe('Step 045.1 & Step 045.2: Checksum Verification & Cloud Existence', () => {
    it('verifies 100% integrity when all cloud objects match database file hashes', async () => {
      // 1. Plaintext file
      const rawContent1 = Buffer.from('PAYFAC INVOICE #101', 'utf8');
      const upload1 = await mockStorage.uploadFile(rawContent1, {
        companyId,
        category: 'invoices',
        filename: 'invoice-101.pdf',
      });

      await fileRepo.createFile({
        company_id: companyId,
        category: 'invoice',
        original_name: 'invoice-101.pdf',
        storage_provider: 'mock',
        storage_path: upload1.key,
        file_hash: computeFileSha256(rawContent1),
        size_bytes: rawContent1.length,
        mime_type: 'application/pdf',
        is_encrypted: false,
        encryption_version: 1,
      });

      // 2. Encrypted file
      const rawContent2 = Buffer.from('CONFIDENTIAL TAX DOCUMENT #202', 'utf8');
      const encrypted = encryptFileBuffer(rawContent2, companyId);
      const upload2 = await mockStorage.uploadFile(encrypted.encryptedBuffer, {
        companyId,
        category: 'invoices',
        filename: 'tax-202.pdf',
      });

      await fileRepo.createFile({
        company_id: companyId,
        category: 'invoice',
        original_name: 'tax-202.pdf',
        storage_provider: 'mock',
        storage_path: upload2.key,
        file_hash: encrypted.originalHash,
        encrypted_hash: encrypted.encryptedHash,
        size_bytes: rawContent2.length,
        mime_type: 'application/pdf',
        is_encrypted: true,
        encryption_version: 1,
      });

      const report = await scanStorageIntegrity({
        fileRepo,
        storageAdapter: mockStorage,
        companyId,
      });

      expect(report.totalFilesScanned).toBe(2);
      expect(report.verifiedCount).toBe(2);
      expect(report.missingCount).toBe(0);
      expect(report.mismatchCount).toBe(0);
      expect(report.isHealthy).toBe(true);
      expect(report.totalStoredBytes).toBeGreaterThan(0);
      expect(report.items.every((i) => i.status === 'VERIFIED')).toBe(true);
    });

    it('detects missing cloud storage object and reports MISSING_OBJECT alert', async () => {
      // Record in database pointing to non-existent storage path
      await fileRepo.createFile({
        company_id: companyId,
        category: 'kyc',
        original_name: 'lost-passport.pdf',
        storage_provider: 'mock',
        storage_path: 'lost/non_existent_key_12345.pdf',
        file_hash: 'a'.repeat(64),
        size_bytes: 1024,
        mime_type: 'application/pdf',
        is_encrypted: false,
        encryption_version: 1,
      });

      const report = await scanStorageIntegrity({
        fileRepo,
        storageAdapter: mockStorage,
        companyId,
      });

      expect(report.totalFilesScanned).toBe(1);
      expect(report.missingCount).toBe(1);
      expect(report.verifiedCount).toBe(0);
      expect(report.isHealthy).toBe(false);

      const missingItem = report.items.find((i) => i.status === 'MISSING_OBJECT');
      expect(missingItem).toBeDefined();
      expect(missingItem?.objectExists).toBe(false);
      expect(missingItem?.checksumMatches).toBe(false);
    });

    it('detects bit rot or payload corruption and reports HASH_MISMATCH alert', async () => {
      const originalPayload = Buffer.from('ORIGINAL FINANCIAL AUDIT SHEET', 'utf8');
      const corruptedPayload = Buffer.from('CORRUPTED BY BIT ROT DEFECT!!', 'utf8');

      // Upload corrupted bytes under the storage path
      const upload = await mockStorage.uploadFile(corruptedPayload, {
        companyId,
        category: 'invoices',
        filename: 'audit.pdf',
      });

      // Register file with expected hash of originalPayload
      await fileRepo.createFile({
        company_id: companyId,
        category: 'invoice',
        original_name: 'audit.pdf',
        storage_provider: 'mock',
        storage_path: upload.key,
        file_hash: computeFileSha256(originalPayload), // expected original
        size_bytes: originalPayload.length,
        mime_type: 'application/pdf',
        is_encrypted: false,
        encryption_version: 1,
      });

      const report = await scanStorageIntegrity({
        fileRepo,
        storageAdapter: mockStorage,
        companyId,
      });

      expect(report.totalFilesScanned).toBe(1);
      expect(report.mismatchCount).toBe(1);
      expect(report.verifiedCount).toBe(0);
      expect(report.isHealthy).toBe(false);

      const mismatchItem = report.items.find((i) => i.status === 'HASH_MISMATCH');
      expect(mismatchItem).toBeDefined();
      expect(mismatchItem?.objectExists).toBe(true);
      expect(mismatchItem?.checksumMatches).toBe(false);
      expect(mismatchItem?.error).toContain('Checksum mismatch');
    });
  });

  describe('Step 045.3: Aggregate Metrics & Health Summary', () => {
    it('accurately computes total stored bytes and gigabytes', async () => {
      const payload1MB = Buffer.alloc(1024 * 1024, 0x42); // 1 MB
      const upload = await mockStorage.uploadFile(payload1MB, {
        companyId,
        category: 'exports',
        filename: 'large-export.csv',
      });

      await fileRepo.createFile({
        company_id: companyId,
        category: 'export',
        original_name: 'large-export.csv',
        storage_provider: 'mock',
        storage_path: upload.key,
        file_hash: computeFileSha256(payload1MB),
        size_bytes: payload1MB.length,
        mime_type: 'text/csv',
        is_encrypted: false,
        encryption_version: 1,
      });

      const report = await scanStorageIntegrity({
        fileRepo,
        storageAdapter: mockStorage,
        companyId,
      });

      expect(report.totalStoredBytes).toBe(1024 * 1024);
      expect(report.totalStoredGigabytes).toBeCloseTo(0.000977, 4);
      expect(report.isHealthy).toBe(true);
    });

    it('identifies crypto-shredded records and reports SHREDDED status without error', async () => {
      await fileRepo.createFile({
        company_id: companyId,
        category: 'logo',
        original_name: '[CRYPTO_SHREDDED]',
        storage_provider: 'mock',
        storage_path: '[SHREDDED_NO_STORAGE]',
        file_hash: '0'.repeat(64),
        size_bytes: 0,
        mime_type: 'image/png',
        is_encrypted: false,
        encryption_version: 1,
      });

      const report = await scanStorageIntegrity({
        fileRepo,
        storageAdapter: mockStorage,
        companyId,
        includeShredded: true,
      });

      expect(report.totalFilesScanned).toBe(1);
      expect(report.shreddedCount).toBe(1);
      expect(report.isHealthy).toBe(true);
      expect(report.items[0].status).toBe('SHREDDED');
    });
  });
});
