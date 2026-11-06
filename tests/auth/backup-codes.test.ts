// path: tests/auth/backup-codes.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  generatePlainBackupCode,
  generateBackupCodesList,
  normalizeBackupCode,
  hashBackupCode,
  verifyBackupCodeHash,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
  regenerateBackupCodes,
  getActiveBackupCodesCount,
} from '@/lib/auth/backup-codes';
import { UserRepository } from '@/lib/db/users';
import { UserBackupCodesRepository } from '@/lib/db/backup-codes';
import { AuditLogRepository } from '@/lib/db/audit';
import { POST as regenerateRoute } from '@/app/api/auth/2fa/backup-codes/regenerate/route';
import { POST as consumeRoute } from '@/app/api/auth/2fa/backup-codes/consume/route';

describe('Step 053: Encrypted Backup Codes Generation & Single-Use Consumption', () => {
  let userRepo: UserRepository;
  let backupRepo: UserBackupCodesRepository;
  let auditRepo: AuditLogRepository;

  const testUserId = '01a1a5bf-9000-7000-8000-111122223333';
  const testUserEmail = 'merchant.recovery@kdsolution.it';

  beforeEach(async () => {
    userRepo = new UserRepository();
    backupRepo = new UserBackupCodesRepository();
    auditRepo = new AuditLogRepository();

    await userRepo.createUser({
      id: testUserId,
      email: testUserEmail,
      full_legal_name: 'Backup Recovery Test Merchant',
      password_hash: 'argon2id$mocked$hash',
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
      is_staff: false,
    });
  });

  describe('Step 053.1: SQL Migration (014_create_backup_codes_table.sql)', () => {
    it('defines user_backup_codes table with user_id, code_hash, used_at, and RLS', () => {
      const sqlPath = path.resolve(process.cwd(), 'db/migrations/014_create_backup_codes_table.sql');
      expect(fs.existsSync(sqlPath)).toBe(true);

      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS public.user_backup_codes');
      expect(sqlContent).toContain('user_id uuid NOT NULL REFERENCES public.users(id)');
      expect(sqlContent).toContain('code_hash varchar(255) NOT NULL');
      expect(sqlContent).toContain('used_at timestamptz NULL');
      expect(sqlContent).toContain('ALTER TABLE public.user_backup_codes ENABLE ROW LEVEL SECURITY');
      expect(sqlContent).toContain('ALTER TABLE public.user_backup_codes FORCE ROW LEVEL SECURITY');
      expect(sqlContent).toContain('CREATE POLICY pol_user_backup_codes_isolation');
    });

    it('has matching rollback script dropping user_backup_codes', () => {
      const downPath = path.resolve(process.cwd(), 'db/migrations/014_create_backup_codes_table.down.sql');
      expect(fs.existsSync(downPath)).toBe(true);
      const downSql = fs.readFileSync(downPath, 'utf8');
      expect(downSql).toContain('DROP TABLE IF EXISTS public.user_backup_codes CASCADE');
    });
  });

  describe('Step 053.2: Generation of 10 Plain Codes & Hash Storage', () => {
    it('generates a single 8-character alphanumeric code formatted as 4-4', () => {
      const code = generatePlainBackupCode();
      expect(code).toBeTypeOf('string');
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);

      const normalized = normalizeBackupCode(code);
      expect(normalized.length).toBe(8);
    });

    it('generates a list of 10 unique plain codes', () => {
      const codes = generateBackupCodesList(10);
      expect(codes.length).toBe(10);
      const unique = new Set(codes);
      expect(unique.size).toBe(10);
    });

    it('hashes plain code with argon2id and verifies successfully', async () => {
      const code = '7K9M-P2X4';
      const hash = await hashBackupCode(code);
      expect(hash).toContain('$argon2id$');

      // Verify matching code
      const isValid = await verifyBackupCodeHash(code, hash);
      expect(isValid).toBe(true);

      // Verify normalized lowercase matching
      const isLowerValid = await verifyBackupCodeHash('7k9m-p2x4', hash);
      expect(isLowerValid).toBe(true);

      // Verify non-matching code
      const isInvalid = await verifyBackupCodeHash('WRONG123', hash);
      expect(isInvalid).toBe(false);
    });

    it('generateBackupCodes stores 10 hashed records in database and never plaintext', async () => {
      const result = await generateBackupCodes(testUserId, {
        repo: backupRepo,
        auditRepo,
        fastHash: true, // Use fast salt-hash in test for rapid execution
      });

      expect(result.count).toBe(10);
      expect(result.plainCodes.length).toBe(10);

      const storedRecords = await backupRepo.findByUserId(testUserId);
      expect(storedRecords.length).toBe(10);

      for (const record of storedRecords) {
        expect(record.user_id).toBe(testUserId);
        expect(record.used_at).toBeNull();
        expect(record.code_hash).toBeTypeOf('string');

        // Verify plaintext code is NOT stored anywhere in record
        for (const plain of result.plainCodes) {
          expect(record.code_hash).not.toBe(plain);
          expect(record.code_hash).not.toBe(normalizeBackupCode(plain));
        }
      }

      const activeCount = await getActiveBackupCodesCount(testUserId, { repo: backupRepo });
      expect(activeCount).toBe(10);
    });
  });

  describe('Step 053.3 & Quality Gate: Single-Use Consumption & Replay Prevention', () => {
    it('verifies code, marks it used, decrements active balance, and prevents replay', async () => {
      const { plainCodes } = await generateBackupCodes(testUserId, {
        repo: backupRepo,
        auditRepo,
        fastHash: true,
      });

      const targetCode = plainCodes[0]!;

      // 1. Initial active count is 10
      expect(await getActiveBackupCodesCount(testUserId, { repo: backupRepo })).toBe(10);

      // 2. First consumption: succeeds
      const result1 = await verifyAndConsumeBackupCode(testUserId, targetCode, {
        repo: backupRepo,
        auditRepo,
      });
      expect(result1.valid).toBe(true);
      expect(result1.remainingCount).toBe(9);

      // Verify database record has used_at populated
      const record = await backupRepo.findById(result1.codeId!);
      expect(record!.used_at).not.toBeNull();

      // 3. Replay attack: submitting same code immediately FAILS
      const result2 = await verifyAndConsumeBackupCode(testUserId, targetCode, {
        repo: backupRepo,
        auditRepo,
      });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Invalid or already consumed');

      // Active count remains 9
      expect(await getActiveBackupCodesCount(testUserId, { repo: backupRepo })).toBe(9);
    });

    it('tolerates lowercase and stripped hyphens during consumption', async () => {
      const { plainCodes } = await generateBackupCodes(testUserId, {
        repo: backupRepo,
        auditRepo,
        fastHash: true,
      });

      const originalCode = plainCodes[3]!; // e.g. "7K9M-P2X4"
      const unformattedInput = originalCode.replace('-', '').toLowerCase(); // e.g. "7k9mp2x4"

      const result = await verifyAndConsumeBackupCode(testUserId, unformattedInput, {
        repo: backupRepo,
        auditRepo,
      });

      expect(result.valid).toBe(true);
      expect(result.remainingCount).toBe(9);
    });

    it('records immutable audit log event on code consumption', async () => {
      const { plainCodes } = await generateBackupCodes(testUserId, {
        repo: backupRepo,
        auditRepo,
        fastHash: true,
      });

      await verifyAndConsumeBackupCode(testUserId, plainCodes[1]!, {
        repo: backupRepo,
        auditRepo,
      });

      const audits = await auditRepo.findMany();
      const consumeAudit = audits.find((a) => a.action === 'BACKUP_CODE_CONSUMED');
      expect(consumeAudit).toBeDefined();
      expect(consumeAudit!.entity_id).toBe(testUserId);
      expect(consumeAudit!.diff_payload?.after).toHaveProperty('remaining_count', 9);
    });

    it('API route POST /api/auth/2fa/backup-codes/consume verifies and marks code used', async () => {
      const { plainCodes } = await generateBackupCodes(testUserId, {
        repo: backupRepo,
        auditRepo,
        fastHash: true,
      });

      const req = new Request('http://localhost:3000/api/auth/2fa/backup-codes/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
        body: JSON.stringify({ code: plainCodes[4] }),
      });

      const res = await consumeRoute(req, { userRepo, backupRepo, auditRepo });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.remaining_count).toBe(9);

      // Replay over API returns 400 Bad Request RFC 7807
      const replayReq = new Request('http://localhost:3000/api/auth/2fa/backup-codes/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
        body: JSON.stringify({ code: plainCodes[4] }),
      });

      const replayRes = await consumeRoute(replayReq, { userRepo, backupRepo, auditRepo });
      expect(replayRes.status).toBe(400);

      const problem = await replayRes.json();
      expect(problem.status).toBe(400);
      expect(problem.title).toBe('Invalid Recovery Code');
    });
  });

  describe('Step 053.4: Invalidation & Regeneration of Fresh Codes', () => {
    it('regenerateBackupCodes invalidates all previous codes and issues 10 new codes', async () => {
      // 1. Generate first batch
      const firstBatch = await generateBackupCodes(testUserId, {
        repo: backupRepo,
        auditRepo,
        fastHash: true,
      });

      // Consume 1 code from first batch
      await verifyAndConsumeBackupCode(testUserId, firstBatch.plainCodes[0]!, {
        repo: backupRepo,
        auditRepo,
      });
      expect(await getActiveBackupCodesCount(testUserId, { repo: backupRepo })).toBe(9);

      // 2. Merchant clicks "Regenerate Backup Codes" in settings
      const secondBatch = await regenerateBackupCodes(testUserId, {
        repo: backupRepo,
        auditRepo,
        fastHash: true,
      });

      expect(secondBatch.count).toBe(10);
      expect(await getActiveBackupCodesCount(testUserId, { repo: backupRepo })).toBe(10);

      // 3. ANY code from first batch is now completely invalidated
      for (const oldCode of firstBatch.plainCodes) {
        const oldAttempt = await verifyAndConsumeBackupCode(testUserId, oldCode, {
          repo: backupRepo,
          auditRepo,
        });
        expect(oldAttempt.valid).toBe(false);
      }

      // 4. Any code from second batch works
      const newAttempt = await verifyAndConsumeBackupCode(testUserId, secondBatch.plainCodes[0]!, {
        repo: backupRepo,
        auditRepo,
      });
      expect(newAttempt.valid).toBe(true);
      expect(newAttempt.remainingCount).toBe(9);
    });

    it('API route POST /api/auth/2fa/backup-codes/regenerate returns 10 new codes', async () => {
      const req = new Request('http://localhost:3000/api/auth/2fa/backup-codes/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': testUserId,
        },
      });

      const res = await regenerateRoute(req, {
        userRepo,
        backupRepo,
        auditRepo,
        fastHash: true,
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.count).toBe(10);
      expect(body.plain_codes.length).toBe(10);
      expect(body.message).toContain('All previous backup codes are now permanently invalidated');
    });

    it('rejects unauthenticated regeneration requests with 401 Unauthorized', async () => {
      const req = new Request('http://localhost:3000/api/auth/2fa/backup-codes/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await regenerateRoute(req, { userRepo, backupRepo, auditRepo });
      expect(res.status).toBe(401);
      const problem = await res.json();
      expect(problem.status).toBe(401);
      expect(problem.title).toBe('Unauthorized');
    });
  });
});
