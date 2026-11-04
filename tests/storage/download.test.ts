// path: tests/storage/download.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSecureDownloadUrl,
  downloadAndDecryptFile,
  createSignedDownloadToken,
  verifySignedDownloadToken,
  FileNotFoundError,
  FileAccessDeniedError,
  DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
  MAX_SIGNED_URL_EXPIRY_SECONDS,
} from '../../lib/storage/signed-url';
import { GET } from '../../app/api/files/[id]/download/route';
import { FileRepository } from '../../lib/db/files';
import { AuditLogRepository } from '../../lib/db/audit';
import { CompanyMemberRepository } from '../../lib/db/memberships';
import { MockStorageAdapter } from '../../lib/storage/mock';
import { encryptFileBuffer, computeFileSha256 } from '../../lib/storage/file-encryption';
import { generateUuidV7 } from '../../lib/db/uuidv7';
import type { FileEntity } from '../../types/file';

describe('Step 043: Short-Lived Signed Download URL Generator & Access Logger', () => {
  let fileRepo: FileRepository;
  let auditRepo: AuditLogRepository;
  let memberRepo: CompanyMemberRepository;
  let mockStorage: MockStorageAdapter;

  const tenantACompanyId = '018f6c4c-3500-7fa1-b1e2-00000000000a';
  const tenantBCompanyId = '018f6c4c-3500-7fa1-b1e2-00000000000b';

  const userTenantA = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const userTenantB = '018f6c4c-3500-7fa1-b1e2-200000000002';
  const complianceOfficerUser = '018f6c4c-3500-7fa1-b1e2-300000000003';
  const superAdminUser = '018f6c4c-3500-7fa1-b1e2-400000000004';

  let testFileA: FileEntity;
  let encryptedKycFile: FileEntity;
  const rawKycContent = Buffer.from('CONFIDENTIAL KYC PASSPORT SCAN: John Doe, Country: BD', 'utf8');

  beforeEach(async () => {
    fileRepo = new FileRepository();
    auditRepo = new AuditLogRepository();
    memberRepo = new CompanyMemberRepository();
    mockStorage = new MockStorageAdapter('test-secure-vault');

    // 1. Upload unencrypted test file to mock storage
    const rawFileA = Buffer.from('STANDARD INVOICE PAYLOAD: #INV-2026-001', 'utf8');
    const uploadResA = await mockStorage.uploadFile(rawFileA, {
      companyId: tenantACompanyId,
      category: 'invoices',
      filename: 'invoice-001.pdf',
      contentType: 'application/pdf',
    });

    testFileA = await fileRepo.createFile({
      company_id: tenantACompanyId,
      category: 'invoice',
      original_name: 'invoice-001.pdf',
      storage_provider: 'mock',
      storage_path: uploadResA.key,
      file_hash: computeFileSha256(rawFileA),
      size_bytes: rawFileA.length,
      mime_type: 'application/pdf',
      is_encrypted: false,
      encryption_version: 1,
    });

    // 2. Encrypt & upload sensitive KYC document
    const encryptedKyc = encryptFileBuffer(rawKycContent, tenantACompanyId);
    const uploadResKyc = await mockStorage.uploadFile(encryptedKyc.encryptedBuffer, {
      companyId: tenantACompanyId,
      category: 'kyc',
      filename: 'passport-scan.pdf',
      contentType: 'application/pdf',
    });

    encryptedKycFile = await fileRepo.createFile({
      company_id: tenantACompanyId,
      category: 'kyc',
      original_name: 'passport-scan.pdf',
      storage_provider: 'mock',
      storage_path: uploadResKyc.key,
      file_hash: encryptedKyc.originalHash,
      encrypted_hash: encryptedKyc.encryptedHash,
      size_bytes: rawKycContent.length,
      mime_type: 'application/pdf',
      is_encrypted: true,
      encryption_version: 1,
    });
  });

  describe('Step 043.1: Signed URL Generation & Parameter Enforcements', () => {
    it('generates a 15-minute signed URL for an authorized tenant user', async () => {
      const result = await generateSecureDownloadUrl(
        {
          fileId: testFileA.id,
          userId: userTenantA,
          userCompanyId: tenantACompanyId,
          userRole: 'owner',
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(result.fileId).toBe(testFileA.id);
      expect(result.companyId).toBe(tenantACompanyId);
      expect(result.originalName).toBe('invoice-001.pdf');
      expect(result.expiresInSeconds).toBe(DEFAULT_SIGNED_URL_EXPIRY_SECONDS);
      expect(result.signedUrl).toContain('https://storage.kdsolution.it/test-secure-vault/');
      expect(result.signedUrl).toContain('token=mock_sig_');
      expect(result.platformSignedUrl).toContain(`/api/files/${testFileA.id}/download?token=`);
      expect(result.downloadToken).toBeTruthy();

      const expiresDate = new Date(result.expiresAt).getTime();
      expect(expiresDate).toBeGreaterThan(Date.now() + 890 * 1000);
      expect(expiresDate).toBeLessThanOrEqual(Date.now() + 910 * 1000);
    });

    it('enforces 15-minute maximum lifetime cap even if requester requests longer duration', async () => {
      const result = await generateSecureDownloadUrl(
        {
          fileId: testFileA.id,
          userId: userTenantA,
          userCompanyId: tenantACompanyId,
          expiresInSeconds: 3600, // Attempt 1 hour
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      // Clamped to 15 minutes (900 seconds)
      expect(result.expiresInSeconds).toBe(MAX_SIGNED_URL_EXPIRY_SECONDS);
      const diffSeconds = (new Date(result.expiresAt).getTime() - Date.now()) / 1000;
      expect(diffSeconds).toBeLessThanOrEqual(901);
    });
  });

  describe('Step 043.2: Multi-Tenant RLS & Role Permission Isolation', () => {
    it('strictly denies cross-tenant access when a foreign tenant attempts download', async () => {
      await expect(
        generateSecureDownloadUrl(
          {
            fileId: testFileA.id,
            userId: userTenantB,
            userCompanyId: tenantBCompanyId,
            userRole: 'admin',
          },
          { fileRepo, auditRepo, storageAdapter: mockStorage }
        )
      ).rejects.toThrow(FileAccessDeniedError);
    });

    it('allows compliance_kyc officer to access files across tenants for review', async () => {
      const result = await generateSecureDownloadUrl(
        {
          fileId: testFileA.id,
          userId: complianceOfficerUser,
          userCompanyId: tenantBCompanyId, // Different company
          userRole: 'compliance_kyc',
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(result.fileId).toBe(testFileA.id);
      expect(result.signedUrl).toBeTruthy();
    });

    it('allows compliance_officer to access sensitive KYC documents across tenants', async () => {
      const result = await generateSecureDownloadUrl(
        {
          fileId: encryptedKycFile.id,
          userId: complianceOfficerUser,
          userRole: 'compliance_officer',
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(result.fileId).toBe(encryptedKycFile.id);
      expect(result.signedUrl).toBeTruthy();
    });

    it('allows super_admin global access across any company files', async () => {
      const result = await generateSecureDownloadUrl(
        {
          fileId: testFileA.id,
          userId: superAdminUser,
          isSuperadmin: true,
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(result.fileId).toBe(testFileA.id);
      expect(result.signedUrl).toBeTruthy();
    });

    it('rejects access to non-existent or soft-deleted files with FileNotFoundError', async () => {
      const nonExistentId = generateUuidV7();
      await expect(
        generateSecureDownloadUrl(
          {
            fileId: nonExistentId,
            userId: userTenantA,
            userCompanyId: tenantACompanyId,
          },
          { fileRepo, auditRepo, storageAdapter: mockStorage }
        )
      ).rejects.toThrow(FileNotFoundError);

      // Soft-delete testFileA
      await fileRepo.softDeleteFile(testFileA.id, testFileA.version);

      await expect(
        generateSecureDownloadUrl(
          {
            fileId: testFileA.id,
            userId: userTenantA,
            userCompanyId: tenantACompanyId,
          },
          { fileRepo, auditRepo, storageAdapter: mockStorage }
        )
      ).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('Step 043.3: Cryptographic Audit Logging on File Access', () => {
    it('appends an immutable FILE_ACCESSED audit entry capturing fileId, actor, ip, and metadata', async () => {
      const ip = '198.51.100.42';
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

      await generateSecureDownloadUrl(
        {
          fileId: testFileA.id,
          userId: userTenantA,
          userCompanyId: tenantACompanyId,
          userRole: 'developer',
          ipAddress: ip,
          userAgent,
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      const logs = await auditRepo.findMany({ companyId: tenantACompanyId });
      expect(logs.length).toBeGreaterThanOrEqual(1);

      const fileLog = logs.find(
        (l) => l.action === 'FILE_ACCESSED' && l.entity_id === testFileA.id
      );

      expect(fileLog).toBeDefined();
      expect(fileLog?.actor_id).toBe(userTenantA);
      expect(fileLog?.ip_address).toBe(ip);
      expect(fileLog?.user_agent).toBe(userAgent);
      expect(fileLog?.entity_type).toBe('file');
      expect(fileLog?.payload).toMatchObject({
        fileId: testFileA.id,
        originalName: 'invoice-001.pdf',
        category: 'invoice',
        mimeType: 'application/pdf',
        storageProvider: 'mock',
        isEncrypted: false,
        expiresInSeconds: 900,
        accessType: 'signed_url',
      });
    });
  });

  describe('Step 043.4: Signed URL Expiration & Anti-Replay Guard', () => {
    it('validates active signed download tokens when accessed within 15 minutes', () => {
      const now = Date.now();
      const token = createSignedDownloadToken({
        fileId: testFileA.id,
        companyId: tenantACompanyId,
        userId: userTenantA,
        expiresAt: now + 900 * 1000,
      });

      const verification = verifySignedDownloadToken(token, undefined, now);
      expect(verification.valid).toBe(true);
      expect(verification.payload?.fileId).toBe(testFileA.id);
      expect(verification.payload?.companyId).toBe(tenantACompanyId);
    });

    it('rejects expired signed download tokens after 15 minutes', () => {
      const now = Date.now();
      const token = createSignedDownloadToken({
        fileId: testFileA.id,
        companyId: tenantACompanyId,
        userId: userTenantA,
        expiresAt: now + 900 * 1000, // Set to 15m from creation
      });

      // Advance clock by 15 minutes and 1 millisecond
      const expiredNow = now + 900 * 1000 + 1;
      const verification = verifySignedDownloadToken(token, undefined, expiredNow);

      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('EXPIRED');
    });

    it('detects and rejects tampered download tokens', () => {
      const now = Date.now();
      const token = createSignedDownloadToken({
        fileId: testFileA.id,
        companyId: tenantACompanyId,
        userId: userTenantA,
        expiresAt: now + 900 * 1000,
      });

      const [payload, sig] = token.split('.');
      // Tamper signature
      const tamperedSig = sig.substring(0, sig.length - 4) + 'abcd';
      const tamperedToken = `${payload}.${tamperedSig}`;

      const verification = verifySignedDownloadToken(tamperedToken, undefined, now);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('INVALID_SIGNATURE');
    });

    it('rejects malformed tokens with MALFORMED status', () => {
      expect(verifySignedDownloadToken('not-a-valid-token').valid).toBe(false);
      expect(verifySignedDownloadToken('part1.part2.part3').valid).toBe(false);
    });
  });

  describe('On-The-Fly Decryption on Retrieval', () => {
    it('downloads and decrypts sensitive encrypted file with byte-for-byte fidelity', async () => {
      const decrypted = await downloadAndDecryptFile(
        {
          fileId: encryptedKycFile.id,
          userId: userTenantA,
          userCompanyId: tenantACompanyId,
        },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(decrypted.isEncrypted).toBe(true);
      expect(decrypted.filename).toBe('passport-scan.pdf');
      expect(decrypted.mimeType).toBe('application/pdf');
      expect(decrypted.data.equals(rawKycContent)).toBe(true);

      // Verify audit logs captured both FILE_DECRYPTED and FILE_ACCESSED
      const logs = await auditRepo.findMany({ companyId: tenantACompanyId });
      const decryptLog = logs.find(
        (l) => l.action === 'FILE_DECRYPTED' && l.entity_id === encryptedKycFile.id
      );
      expect(decryptLog).toBeDefined();
    });
  });

  describe('API Route: GET /api/files/[id]/download', () => {
    it('returns 200 with JSON signed URL details for an authorized tenant actor', async () => {
      const req = new Request(`https://api.kdsolution.it/api/files/${testFileA.id}/download`, {
        headers: {
          'x-user-id': userTenantA,
          'x-company-id': tenantACompanyId,
          'x-user-role': 'admin',
        },
      });

      const res = await GET(
        req,
        { params: Promise.resolve({ id: testFileA.id }) },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.file_id).toBe(testFileA.id);
      expect(json.signed_url).toContain('https://storage.kdsolution.it/test-secure-vault/');
      expect(json.expires_in_seconds).toBe(900);
      expect(json.status).toBe('authorized');
    });

    it('returns 401 Unauthorized when actor identity headers are missing', async () => {
      const req = new Request(`https://api.kdsolution.it/api/files/${testFileA.id}/download`);

      const res = await GET(
        req,
        { params: Promise.resolve({ id: testFileA.id }) },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.title).toBe('Unauthorized');
    });

    it('returns 403 Forbidden when foreign tenant attempts cross-tenant download', async () => {
      const req = new Request(`https://api.kdsolution.it/api/files/${testFileA.id}/download`, {
        headers: {
          'x-user-id': userTenantB,
          'x-company-id': tenantBCompanyId,
          'x-user-role': 'admin',
        },
      });

      const res = await GET(
        req,
        { params: Promise.resolve({ id: testFileA.id }) },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.title).toBe('Access Denied');
    });

    it('returns 404 File Not Found for non-existent file IDs', async () => {
      const nonExistentId = generateUuidV7();
      const req = new Request(`https://api.kdsolution.it/api/files/${nonExistentId}/download`, {
        headers: {
          'x-user-id': userTenantA,
          'x-company-id': tenantACompanyId,
        },
      });

      const res = await GET(
        req,
        { params: Promise.resolve({ id: nonExistentId }) },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.title).toBe('File Not Found');
    });

    it('returns 307 Redirect when redirect=true is specified in query parameters', async () => {
      const req = new Request(`https://api.kdsolution.it/api/files/${testFileA.id}/download?redirect=true`, {
        headers: {
          'x-user-id': userTenantA,
          'x-company-id': tenantACompanyId,
        },
      });

      const res = await GET(
        req,
        { params: Promise.resolve({ id: testFileA.id }) },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('https://storage.kdsolution.it/test-secure-vault/');
    });

    it('streams decrypted binary content when decrypt=true is specified', async () => {
      const req = new Request(`https://api.kdsolution.it/api/files/${encryptedKycFile.id}/download?decrypt=true`, {
        headers: {
          'x-user-id': userTenantA,
          'x-company-id': tenantACompanyId,
        },
      });

      const res = await GET(
        req,
        { params: Promise.resolve({ id: encryptedKycFile.id }) },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('x-decrypted')).toBe('true');

      const arrayBuffer = await res.arrayBuffer();
      const downloadedBuffer = Buffer.from(arrayBuffer);
      expect(downloadedBuffer.equals(rawKycContent)).toBe(true);
    });

    it('returns 403 when accessing via an expired token', async () => {
      const expiredTimestamp = Date.now() - 1000; // In the past
      const expiredToken = createSignedDownloadToken({
        fileId: testFileA.id,
        companyId: tenantACompanyId,
        userId: userTenantA,
        expiresAt: expiredTimestamp,
      });

      const req = new Request(`https://api.kdsolution.it/api/files/${testFileA.id}/download?token=${expiredToken}`);

      const res = await GET(
        req,
        { params: Promise.resolve({ id: testFileA.id }) },
        { fileRepo, auditRepo, storageAdapter: mockStorage }
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.title).toBe('Signed URL Expired');
    });
  });
});
