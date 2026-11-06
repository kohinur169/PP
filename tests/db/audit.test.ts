// path: tests/db/audit.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogRepository } from '../../lib/db/audit';
import { isValidUuidV7 } from '../../lib/db/uuidv7';
import {
  AuditLogCreateSchema,
  AuditLogEntity,
  CreateAuditLogInput,
  GENESIS_HASH,
} from '../../types/audit';
import {
  canonicalizeJson,
  computeAuditHash,
  verifyAuditHash,
} from '../../lib/audit/hasher';

describe('Step 024: Hash-Chained Append-Only Audit Log Schema Migration', () => {
  let repository: AuditLogRepository;

  const mockCompanyId = '018f6c4c-3500-7fa1-b1e2-aaaaaaaaaaaa';
  const mockActorId = '018f6c4c-4500-7fa1-b1e2-111111111111';

  beforeEach(() => {
    repository = new AuditLogRepository();
  });

  const createSampleLogInput = (
    overrides?: Partial<CreateAuditLogInput>
  ): CreateAuditLogInput => ({
    company_id: mockCompanyId,
    actor_id: mockActorId,
    action: 'AUTH_LOGIN_SUCCESS',
    entity_type: 'user_session',
    entity_id: '018f6c4c-5500-7fa1-b1e2-222222222222',
    payload: {
      ip: '192.168.1.1',
      device: 'Desktop Browser',
    },
    ...overrides,
  });

  describe('Audit Log Append & Cryptographic Hashing', () => {
    it('creates genesis audit log entry with UUIDv7, sequence_id = 1, and prev_hash = GENESIS_HASH', async () => {
      const input = createSampleLogInput();
      const entry = await repository.append(input);

      expect(isValidUuidV7(entry.id)).toBe(true);
      expect(entry.sequence_id).toBe(1);
      expect(entry.prev_hash).toBe(GENESIS_HASH);
      expect(entry.current_hash).toHaveLength(64);
      expect(entry.entry_hash).toBe(entry.current_hash);
      expect(entry.action).toBe('AUTH_LOGIN_SUCCESS');
      expect(entry.entity_type).toBe('user_session');
      expect(entry.company_id).toBe(mockCompanyId);
      expect(entry.actor_id).toBe(mockActorId);
      expect(entry.deleted_at).toBeNull();
      expect(entry.version).toBe(1);

      // Verify self-hash integrity
      const isValid = verifyAuditHash(entry);
      expect(isValid).toBe(true);
    });

    it('enforces canonical JSON serialization where key order does not alter the hash', () => {
      const payloadA = { b: 2, a: 1, c: { y: 'test', x: 10 } };
      const payloadB = { a: 1, c: { x: 10, y: 'test' }, b: 2 };

      const canonA = canonicalizeJson(payloadA);
      const canonB = canonicalizeJson(payloadB);

      expect(canonA).toBe(canonB);

      const hashA = computeAuditHash(GENESIS_HASH, 1, payloadA);
      const hashB = computeAuditHash(GENESIS_HASH, 1, payloadB);

      expect(hashA).toBe(hashB);
    });

    it('chains consecutive audit entries monotonically and links prev_hash to previous current_hash', async () => {
      const entry1 = await repository.append(
        createSampleLogInput({ action: 'COMPANY_CREATED', entity_type: 'company' })
      );
      const entry2 = await repository.append(
        createSampleLogInput({ action: 'MEMBER_INVITED', entity_type: 'company_member' })
      );
      const entry3 = await repository.append(
        createSampleLogInput({ action: 'KYC_DOCUMENT_SUBMITTED', entity_type: 'kyc_document' })
      );

      expect(entry1.sequence_id).toBe(1);
      expect(entry2.sequence_id).toBe(2);
      expect(entry3.sequence_id).toBe(3);

      expect(entry1.prev_hash).toBe(GENESIS_HASH);
      expect(entry2.prev_hash).toBe(entry1.current_hash);
      expect(entry3.prev_hash).toBe(entry2.current_hash);

      const verification = await repository.verifyChainIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.verifiedCount).toBe(3);
    });
  });

  describe('Tamper-Proofing & Integrity Verification', () => {
    it('detects payload tampering in the audit chain', async () => {
      await repository.append(createSampleLogInput({ action: 'EVENT_1' }));
      const entry2 = await repository.append(createSampleLogInput({ action: 'EVENT_2' }));
      await repository.append(createSampleLogInput({ action: 'EVENT_3' }));

      // Tamper with entry 2 payload in underlying storage driver
      const driver = (repository as any).driver;
      const tamperedEntry2: AuditLogEntity = {
        ...entry2,
        payload: { ...entry2.payload, malicious_edit: true },
      };
      await driver.insert(tamperedEntry2);

      const verification = await repository.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenSequenceId).toBe(2);
      expect(verification.reason).toMatch(/Hash corruption detected/);
    });

    it('detects broken hash chain linkage when prev_hash is altered', async () => {
      await repository.append(createSampleLogInput({ action: 'EVENT_1' }));
      const entry2 = await repository.append(createSampleLogInput({ action: 'EVENT_2' }));

      // Tamper with prev_hash on entry 2
      const driver = (repository as any).driver;
      const forgedPrevHash = 'f'.repeat(64);
      const forgedHash = computeAuditHash(forgedPrevHash, entry2.sequence_id, entry2.payload);
      const forgedEntry2: AuditLogEntity = {
        ...entry2,
        prev_hash: forgedPrevHash,
        current_hash: forgedHash,
        entry_hash: forgedHash,
      };
      await driver.insert(forgedEntry2);

      const verification = await repository.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenSequenceId).toBe(2);
      expect(verification.reason).toMatch(/Broken hash chain/);
    });

    it('forbids update, soft-delete, restore, and hard-delete operations on audit logs', async () => {
      const entry = await repository.append(createSampleLogInput());

      await expect(repository.update(entry.id, 1, {} as any)).rejects.toThrow(
        /Audit logs are strictly append-only; update is forbidden/
      );

      await expect(repository.softDelete(entry.id, 1)).rejects.toThrow(
        /Audit logs are strictly append-only; soft deletion is forbidden/
      );

      await expect(repository.restore(entry.id, 1)).rejects.toThrow(
        /Audit logs are strictly append-only; restoration is forbidden/
      );

      await expect(repository.hardDelete(entry.id)).rejects.toThrow(
        /Audit logs are strictly append-only; hard deletion is forbidden/
      );
    });
  });

  describe('Diff Payload & Query Operations', () => {
    it('stores structured diff payloads recording before/after state changes', async () => {
      const diffPayload = {
        before: { status: 'pending_verification', risk_tier: 'tier_1' },
        after: { status: 'active', risk_tier: 'tier_2' },
        changed_fields: ['status', 'risk_tier'],
      };

      const entry = await repository.append(
        createSampleLogInput({
          action: 'RISK_TIER_CHANGED',
          entity_type: 'company',
          diff_payload: diffPayload,
        })
      );

      expect(entry.diff_payload).toEqual(diffPayload);
      expect(entry.diff_payload?.changed_fields).toContain('risk_tier');
    });

    it('queries logs by entity type, actor, action, company, and sequence_id', async () => {
      const entityId = '018f6c4c-7700-7fa1-b1e2-333333333333';
      await repository.append(
        createSampleLogInput({
          entity_type: 'company',
          entity_id: entityId,
          action: 'COMPANY_CREATED',
        })
      );
      await repository.append(
        createSampleLogInput({
          entity_type: 'company',
          entity_id: entityId,
          action: 'COMPANY_UPDATED',
        })
      );

      const byEntity = await repository.findByEntity('company', entityId);
      expect(byEntity).toHaveLength(2);

      const byActor = await repository.findByActor(mockActorId);
      expect(byActor.length).toBeGreaterThanOrEqual(2);

      const byAction = await repository.findByAction('COMPANY_CREATED');
      expect(byAction).toHaveLength(1);

      const byCompany = await repository.findByCompany(mockCompanyId);
      expect(byCompany.length).toBeGreaterThanOrEqual(2);

      const bySequence = await repository.findBySequenceId(1);
      expect(bySequence).not.toBeNull();
      expect(bySequence?.sequence_id).toBe(1);

      const last = await repository.getLastEntry();
      expect(last).not.toBeNull();
      expect(last?.sequence_id).toBe(2);
    });

    it('validates creation payload using AuditLogCreateSchema', () => {
      const valid = AuditLogCreateSchema.safeParse({
        action: 'PAYMENT_CAPTURED',
        entity_type: 'payment',
        payload: { amount: '150.0000', currency: 'USD' },
      });
      expect(valid.success).toBe(true);

      const invalidHash = AuditLogCreateSchema.safeParse({
        action: 'PAYMENT_CAPTURED',
        entity_type: 'payment',
        prev_hash: 'not-a-valid-64-character-hash',
      });
      expect(invalidHash.success).toBe(false);
    });
  });

  describe('Migration DDL & PostgreSQL Compliance', () => {
    it('verifies SQL migration files contain required schema, indexes, and RLS', () => {
      const dbMigrationPath = path.resolve(
        process.cwd(),
        'db/migrations/009_create_audit_logs_table.sql'
      );
      const supabaseMigrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000013_create_audit_logs_table.sql'
      );

      expect(fs.existsSync(dbMigrationPath)).toBe(true);
      expect(fs.existsSync(supabaseMigrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(dbMigrationPath, 'utf8');

      // Verify sequence_id bigserial and UUIDv7 primary key
      expect(sqlContent).toMatch(/sequence_id\s+bigserial/i);
      expect(sqlContent).toMatch(/id\s+uuid\s+PRIMARY\s+KEY\s+DEFAULT\s+generate_uuid_v7\(\)/i);

      // Verify cryptographic and context columns
      expect(sqlContent).toMatch(/prev_hash\s+varchar\(64\)/i);
      expect(sqlContent).toMatch(/current_hash\s+varchar\(64\)/i);
      expect(sqlContent).toMatch(/signature\s+varchar\(256\)/i);
      expect(sqlContent).toMatch(/actor_id\s+uuid/i);
      expect(sqlContent).toMatch(/action\s+varchar\(100\)/i);
      expect(sqlContent).toMatch(/diff_payload\s+jsonb/i);
      expect(sqlContent).toMatch(/payload\s+jsonb/i);

      // Verify Step 024.3 required indexes
      expect(sqlContent).toMatch(/idx_audit_logs_company_id/i);
      expect(sqlContent).toMatch(/idx_audit_logs_action/i);
      expect(sqlContent).toMatch(/idx_audit_logs_entity_type/i);
      expect(sqlContent).toMatch(/idx_audit_logs_created_at/i);
      expect(sqlContent).toMatch(/idx_audit_logs_sequence_id/i);

      // Verify RLS is enabled and forced
      expect(sqlContent).toMatch(/ALTER\s+TABLE\s+public\.audit_logs\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(sqlContent).toMatch(/ALTER\s+TABLE\s+public\.audit_logs\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
      expect(sqlContent).toMatch(/CREATE\s+POLICY\s+pol_audit_logs_tenant_isolation/i);
    });

    it('verifies supabase/migrations/20261103000013_create_audit_logs_table.sql matches schema definitions', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000013_create_audit_logs_table.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('attach_standard_table_triggers');
      expect(sql).toContain('idx_audit_logs_hashes');
      expect(sql).toContain('idx_audit_logs_entity_lookup');
      expect(sql).toContain('pol_audit_logs_tenant_isolation');
    });
  });
});
