// path: tests/storage/retention.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  softDeleteFile,
  cryptoShredFile,
  checkFileRetentionPolicy,
  RetentionViolationError,
  SEVEN_YEARS_MS,
} from '../../lib/storage/retention';
import { FileRepository } from '../../lib/db/files';
import { AuditLogRepository } from '../../lib/db/audit';
import { MockStorageAdapter } from '../../lib/storage/mock';
import { computeFileSha256 } from '../../lib/storage/file-encryption';
import type { FileEntity } from '../../types/file';

describe('Step 044: Secure File Deletion, Crypto-Shredding & Retention Pipeline', () => {
  let fileRepo: FileRepository;
  let auditRepo: AuditLogRepository;
  let mockStorage: MockStorageAdapter;

  const companyId = '018f6c4c-3500-7fa1-b1e2-000000000044';
  const actorId = '018f6c4c-3500-7fa1-b1e2-100000000044';

  let kycFile: FileEntity;
  let merchantLogoFile: FileEntity;
  let disputeEvidenceFile: FileEntity;

  const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
  const EIGHT_YEARS_MS = 8 * 365.25 * 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    fileRepo = new FileRepository();
    auditRepo = new AuditLogRepository();
    mockStorage = new MockStorageAdapter('retention-vault');

    // 1. Create a KYC passport document
    const kycBuffer = Buffer.from('CONFIDENTIAL PASSPORT SCAN - FINCEN AML PROTECTED', 'utf8');
    const uploadKyc = await mockStorage.uploadFile(kycBuffer, {
      companyId,
      category: 'kyc',
      filename: 'passport-kyc.pdf',
    });

    kycFile = await fileRepo.createFile({
      company_id: companyId,
      category: 'kyc',
      original_name: 'passport-kyc.pdf',
      storage_provider: 'mock',
      storage_path: uploadKyc.key,
      file_hash: computeFileSha256(kycBuffer),
      size_bytes: kycBuffer.length,
      mime_type: 'application/pdf',
      is_encrypted: true,
      encryption_version: 1,
    });

    // 2. Create a non-statutory merchant logo file
    const logoBuffer = Buffer.from('PNG_IMAGE_BYTES_LOGO', 'utf8');
    const uploadLogo = await mockStorage.uploadFile(logoBuffer, {
      companyId,
      category: 'logos',
      filename: 'brand-logo.png',
    });

    merchantLogoFile = await fileRepo.createFile({
      company_id: companyId,
      category: 'logo',
      original_name: 'brand-logo.png',
      storage_provider: 'mock',
      storage_path: uploadLogo.key,
      file_hash: computeFileSha256(logoBuffer),
      size_bytes: logoBuffer.length,
      mime_type: 'image/png',
      is_encrypted: false,
      encryption_version: 1,
    });

    // 3. Create a dispute evidence document
    const disputeBuffer = Buffer.from('CHARGEBACK DISPUTE REBUTTAL EVIDENCE', 'utf8');
    const uploadDispute = await mockStorage.uploadFile(disputeBuffer, {
      companyId,
      category: 'disputes',
      filename: 'dispute-rebuttal.pdf',
    });

    disputeEvidenceFile = await fileRepo.createFile({
      company_id: companyId,
      category: 'dispute',
      original_name: 'dispute-rebuttal.pdf',
      storage_provider: 'mock',
      storage_path: uploadDispute.key,
      file_hash: computeFileSha256(disputeBuffer),
      size_bytes: disputeBuffer.length,
      mime_type: 'application/pdf',
      is_encrypted: true,
      encryption_version: 1,
    });
  });

  describe('Step 044.1: Soft-Deletion Lifecycle Guard', () => {
    it('marks deleted_at timestamp without physically deleting storage object', async () => {
      const softDeleted = await softDeleteFile(
        {
          fileId: kycFile.id,
          actorId,
          reason: 'Merchant requested account closure',
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(softDeleted.deleted_at).toBeTruthy();

      // Verify physical storage object is still intact
      const storageObject = await mockStorage.downloadFile(
        kycFile.storage_path,
        kycFile.company_id
      );
      expect(storageObject.data.length).toBeGreaterThan(0);

      // Verify audit log recorded soft delete
      const logs = await auditRepo.findMany({ companyId });
      const deleteLog = logs.find(
        (l) => l.action === 'FILE_DELETED' && l.entity_id === kycFile.id
      );
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.payload).toMatchObject({
        deletionType: 'soft_delete',
      });
    });
  });

  describe('Step 044.2 & Step 044.4: Regulatory 7-Year Retention Checker & Prevention Guard', () => {
    it('verifies checkFileRetentionPolicy detects active retention for a 1-year-old KYC document', () => {
      const oneYearLater = new Date(kycFile.created_at).getTime() + ONE_YEAR_MS;
      const status = checkFileRetentionPolicy(kycFile, oneYearLater);

      expect(status.isMandated).toBe(true);
      expect(status.isRetentionActive).toBe(true);
      expect(status.eligibleForCryptoShredding).toBe(false);
      expect(status.daysRemaining).toBeGreaterThan(2000); // ~6 years remaining
      expect(status.summary).toContain('must be retained until');
    });

    it('rejects deletion of 1-year-old KYC file with RetentionViolationError', async () => {
      const oneYearLater = new Date(kycFile.created_at).getTime() + ONE_YEAR_MS;

      await expect(
        cryptoShredFile(
          {
            fileId: kycFile.id,
            actorId,
            reason: 'Attempting early purge of active KYC document',
            now: oneYearLater,
          },
          { fileRepo, auditRepo, storageAdapter: mockStorage }
        )
      ).rejects.toThrow(RetentionViolationError);

      // Verify object still exists in storage
      const storageFile = await mockStorage.downloadFile(
        kycFile.storage_path,
        kycFile.company_id
      );
      expect(storageFile.data.length).toBeGreaterThan(0);
    });

    it('rejects deletion of 1-year-old dispute evidence document due to 7-year card network retention', async () => {
      const oneYearLater = new Date(disputeEvidenceFile.created_at).getTime() + ONE_YEAR_MS;

      await expect(
        cryptoShredFile(
          {
            fileId: disputeEvidenceFile.id,
            actorId,
            now: oneYearLater,
          },
          { fileRepo, auditRepo, storageAdapter: mockStorage }
        )
      ).rejects.toThrow(RetentionViolationError);
    });

    it('permits immediate crypto-shredding of non-statutory merchant logos', async () => {
      const result = await cryptoShredFile(
        {
          fileId: merchantLogoFile.id,
          actorId,
          reason: 'Merchant replaced branding logo',
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(result.storageObjectDeleted).toBe(true);
      expect(result.metadataZeroed).toBe(true);

      // Storage object must now be purged
      await expect(
        mockStorage.downloadFile(merchantLogoFile.storage_path, merchantLogoFile.company_id)
      ).rejects.toThrow();
    });
  });

  describe('Step 044.3: Crypto-Shredding of Expired Records', () => {
    it('successfully shreds 8-year-old KYC document after statutory retention period expires', async () => {
      const eightYearsLater = new Date(kycFile.created_at).getTime() + EIGHT_YEARS_MS;

      const result = await cryptoShredFile(
        {
          fileId: kycFile.id,
          actorId,
          reason: 'Statutory 7-year retention elapsed, destroying file and metadata',
          now: eightYearsLater,
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(result.storageObjectDeleted).toBe(true);
      expect(result.metadataZeroed).toBe(true);
      expect(result.auditLogRecorded).toBe(true);

      // Verify storage object deleted
      await expect(
        mockStorage.downloadFile(kycFile.storage_path, kycFile.company_id)
      ).rejects.toThrow();

      // Verify database record has zeroed hash and sanitized path
      const shreddedRecord = await fileRepo.findById(kycFile.id, { includeDeleted: true });
      expect(shreddedRecord?.original_name).toBe('[CRYPTO_SHREDDED]');
      expect(shreddedRecord?.storage_path).toBe('[SHREDDED_NO_STORAGE]');
      expect(shreddedRecord?.file_hash).toBe('0'.repeat(64));
      expect(shreddedRecord?.size_bytes).toBe(0);
      expect(shreddedRecord?.deleted_at).toBeTruthy();

      // Verify audit log captured crypto_shred action
      const logs = await auditRepo.findMany({ companyId });
      const shredLog = logs.find(
        (l) => l.action === 'FILE_DELETED' && l.entity_id === kycFile.id
      );
      expect(shredLog).toBeDefined();
      expect(shredLog?.payload).toMatchObject({
        deletionType: 'crypto_shred',
      });
    });

    it('allows certified court order override by superadmin with legal court reference', async () => {
      const oneYearLater = new Date(kycFile.created_at).getTime() + ONE_YEAR_MS;

      const result = await cryptoShredFile(
        {
          fileId: kycFile.id,
          actorId,
          isSuperadmin: true,
          forceOverrideWithCourtOrder: true,
          courtOrderReference: 'SUPREME-COURT-WRIT-2026-9812-SEALED',
          reason: 'Legal compliance statutory destruction order',
          now: oneYearLater,
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(result.storageObjectDeleted).toBe(true);
      expect(result.metadataZeroed).toBe(true);

      const logs = await auditRepo.findMany({ companyId });
      const shredLog = logs.find(
        (l) => l.action === 'FILE_DELETED' && l.entity_id === kycFile.id
      );
      expect(shredLog?.payload).toMatchObject({
        deletionType: 'crypto_shred',
        courtOrderReference: 'SUPREME-COURT-WRIT-2026-9812-SEALED',
      });
    });
  });
});
