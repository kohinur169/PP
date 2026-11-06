// path: tests/db/files.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { FileRepository } from '../../lib/db/files';
import { isValidUuidV7 } from '../../lib/db/uuidv7';
import { CreateFileInput, FileEntity } from '../../types/file';
import { OptimisticLockError } from '../../types/entity';

describe('Step 042: File Metadata Schema & Company Isolation Migration', () => {
  const migrationsDir = path.resolve(process.cwd(), 'db/migrations');
  const companyA = '018f6c4c-3500-7fa1-b1e2-123456789abc';
  const companyB = '018f6c4c-3500-7fa1-b1e2-987654321def';

  let fileRepo: FileRepository;

  beforeEach(() => {
    fileRepo = new FileRepository();
  });

  const validSampleInput = (overrides?: Partial<CreateFileInput>): CreateFileInput => ({
    company_id: companyA,
    category: 'kyc',
    original_name: 'acme_incorporation_doc.pdf',
    storage_provider: 'supabase',
    storage_path: `${companyA}/kyc/acme_incorporation_doc.pdf.enc`,
    file_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    encrypted_hash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    size_bytes: 1048576, // 1 MB
    mime_type: 'application/pdf',
    is_encrypted: true,
    encryption_version: 1,
    ...overrides,
  });

  describe('Step 042.1 & Step 042.2: DDL Migration & Schema Structure', () => {
    it('verifies db/migrations/012_create_files_table.sql exists with complete schema, indexes, and triggers', () => {
      const sqlPath = path.join(migrationsDir, '012_create_files_table.sql');
      expect(fs.existsSync(sqlPath)).toBe(true);

      const sql = fs.readFileSync(sqlPath, 'utf8');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.files');
      expect(sql).toContain('company_id uuid NOT NULL REFERENCES public.companies(id)');
      expect(sql).toContain('category varchar(50) NOT NULL');
      expect(sql).toContain('storage_provider varchar(20) NOT NULL');
      expect(sql).toContain('storage_path text NOT NULL');
      expect(sql).toContain('file_hash varchar(64) NOT NULL');
      expect(sql).toContain('size_bytes bigint NOT NULL');
      expect(sql).toContain('mime_type varchar(100) NOT NULL');
      expect(sql).toContain('is_encrypted boolean NOT NULL');
      expect(sql).toContain('attach_standard_table_triggers');
    });

    it('verifies db/migrations/012_create_files_table.down.sql cleanly drops the table', () => {
      const downPath = path.join(migrationsDir, '012_create_files_table.down.sql');
      expect(fs.existsSync(downPath)).toBe(true);

      const downSql = fs.readFileSync(downPath, 'utf8');
      expect(downSql).toContain('DROP TABLE IF EXISTS public.files CASCADE');
    });

    it('verifies Row Level Security default-deny and tenant isolation policies', () => {
      const sqlPath = path.join(migrationsDir, '012_create_files_table.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');

      expect(sql).toContain('ALTER TABLE public.files ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE public.files FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('CREATE POLICY pol_files_tenant_isolation ON public.files');
      expect(sql).toContain('company_id = get_current_company_id()');
      expect(sql).toContain('is_current_superadmin()');
    });
  });

  describe('Step 042.4: File Metadata CRUD Operations', () => {
    it('creates file metadata record with UUIDv7 ID and default version 1', async () => {
      const input = validSampleInput();
      const file = await fileRepo.createFile(input);

      expect(isValidUuidV7(file.id)).toBe(true);
      expect(file.company_id).toBe(companyA);
      expect(file.category).toBe('kyc');
      expect(file.original_name).toBe('acme_incorporation_doc.pdf');
      expect(file.storage_provider).toBe('supabase');
      expect(file.file_hash).toBe(input.file_hash);
      expect(file.size_bytes).toBe(1048576);
      expect(file.is_encrypted).toBe(true);
      expect(file.encryption_version).toBe(1);
      expect(file.version).toBe(1);
      expect(file.created_at).toBeDefined();
      expect(file.deleted_at).toBeNull();
    });

    it('rejects invalid file hash or negative size', async () => {
      await expect(
        fileRepo.createFile(validSampleInput({ file_hash: 'not-a-valid-hash' }))
      ).rejects.toThrow();

      await expect(
        fileRepo.createFile(validSampleInput({ size_bytes: -50 }))
      ).rejects.toThrow();
    });

    it('finds file by SHA-256 hash', async () => {
      const input = validSampleInput({
        file_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });
      await fileRepo.createFile(input);

      const found = await fileRepo.findFileByHash(input.file_hash, companyA);
      expect(found).not.toBeNull();
      expect(found?.original_name).toBe(input.original_name);
    });

    it('supports category filtering when listing company files', async () => {
      await fileRepo.createFile(validSampleInput({ category: 'kyc' }));
      await fileRepo.createFile(validSampleInput({ category: 'dispute' }));
      await fileRepo.createFile(validSampleInput({ category: 'logo' }));

      const kycFiles = await fileRepo.findFilesByCompany(companyA, { category: 'kyc' });
      expect(kycFiles).toHaveLength(1);
      expect(kycFiles[0]?.category).toBe('kyc');

      const allFiles = await fileRepo.findFilesByCompany(companyA);
      expect(allFiles).toHaveLength(3);
    });

    it('enforces optimistic locking on updates and soft deletion', async () => {
      const created = await fileRepo.createFile(validSampleInput());

      const updated = await fileRepo.update(created.id, created.version, {
        original_name: 'renamed_doc.pdf',
      });
      expect(updated.version).toBe(2);
      expect(updated.original_name).toBe('renamed_doc.pdf');

      // Stale version update must fail
      await expect(
        fileRepo.update(created.id, created.version, { original_name: 'stale.pdf' })
      ).rejects.toThrow(OptimisticLockError);

      // Soft delete
      const deleted = await fileRepo.softDeleteFile(created.id, updated.version);
      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.version).toBe(3);

      const afterDelete = await fileRepo.findFileById(created.id);
      expect(afterDelete).toBeNull(); // Soft deleted items omitted by default
    });
  });

  describe('Step 042.3: Multi-Tenant Company Isolation', () => {
    it('prevents Company A from querying or accessing file records belonging to Company B', async () => {
      const fileB = await fileRepo.createFile(
        validSampleInput({
          company_id: companyB,
          original_name: 'company_b_tax_return.pdf',
        })
      );

      // Company A querying by ID with companyId filter must return null
      const isolatedQuery = await fileRepo.findFileById(fileB.id, companyA);
      expect(isolatedQuery).toBeNull();

      // Company B querying its own file succeeds
      const legitimateQuery = await fileRepo.findFileById(fileB.id, companyB);
      expect(legitimateQuery).not.toBeNull();
      expect(legitimateQuery?.id).toBe(fileB.id);

      // Global query (e.g. super admin) succeeds
      const adminQuery = await fileRepo.findFileById(fileB.id);
      expect(adminQuery).not.toBeNull();
    });

    it('isolates company file listings so no cross-tenant records leak', async () => {
      await fileRepo.createFile(validSampleInput({ company_id: companyA }));
      await fileRepo.createFile(validSampleInput({ company_id: companyA }));
      await fileRepo.createFile(validSampleInput({ company_id: companyB }));

      const filesA = await fileRepo.findFilesByCompany(companyA);
      const filesB = await fileRepo.findFilesByCompany(companyB);

      expect(filesA).toHaveLength(2);
      expect(filesB).toHaveLength(1);

      for (const f of filesA) {
        expect(f.company_id).toBe(companyA);
      }
      for (const f of filesB) {
        expect(f.company_id).toBe(companyB);
      }
    });
  });
});
