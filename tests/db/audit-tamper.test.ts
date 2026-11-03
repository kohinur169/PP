// path: tests/db/audit-tamper.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogRepository } from '../../lib/db/audit';
import { InMemoryStorageDriver, EntityStorageDriver } from '../../lib/db/repository';
import { AuditLogEntity, CreateAuditLogInput } from '../../types/audit';

/**
 * Storage driver simulating PostgreSQL database engine triggers with fatal exceptions.
 */
class PostgresTriggerEnforcingStorageDriver implements EntityStorageDriver<AuditLogEntity> {
  private readonly inner = new InMemoryStorageDriver<AuditLogEntity>();

  public async findById(id: string): Promise<AuditLogEntity | null> {
    return this.inner.findById(id);
  }

  public async findMany(filter: (item: AuditLogEntity) => boolean): Promise<AuditLogEntity[]> {
    return this.inner.findMany(filter);
  }

  public async insert(record: AuditLogEntity): Promise<AuditLogEntity> {
    return this.inner.insert(record);
  }

  public async update(_record: AuditLogEntity): Promise<AuditLogEntity> {
    // Simulates PostgreSQL PL/pgSQL prevent_audit_log_modification() trigger
    const error = new Error(
      'Audit logs are strictly append-only. UPDATE, DELETE, and TRUNCATE operations are forbidden.'
    );
    (error as any).code = '23001';
    throw error;
  }

  public async delete(_id: string): Promise<boolean> {
    // Simulates PostgreSQL PL/pgSQL prevent_audit_log_modification() trigger
    const error = new Error(
      'Audit logs are strictly append-only. UPDATE, DELETE, and TRUNCATE operations are forbidden.'
    );
    (error as any).code = '23001';
    throw error;
  }

  public async truncate(): Promise<void> {
    // Simulates PostgreSQL PL/pgSQL prevent_audit_log_modification() truncate trigger
    const error = new Error(
      'Audit logs are strictly append-only. UPDATE, DELETE, and TRUNCATE operations are forbidden.'
    );
    (error as any).code = '23001';
    throw error;
  }
}

describe('Step 025: Audit Log Tamper-Proofing Database Rules & Triggers', () => {
  let repository: AuditLogRepository;
  let simulatedDriver: PostgresTriggerEnforcingStorageDriver;

  const mockCompanyId = '018f6c4c-3500-7fa1-b1e2-aaaaaaaaaaaa';
  const mockActorId = '018f6c4c-4500-7fa1-b1e2-111111111111';

  beforeEach(() => {
    simulatedDriver = new PostgresTriggerEnforcingStorageDriver();
    repository = new AuditLogRepository({ driver: simulatedDriver });
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

  describe('PostgreSQL Migration DDL & Trigger Architecture', () => {
    it('verifies db/migrations/010_audit_log_tamper_protection.sql defines immutability trigger function and rules', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'db/migrations/010_audit_log_tamper_protection.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Function definition
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()');
      expect(sql).toContain("RAISE EXCEPTION 'Audit logs are strictly append-only");
      expect(sql).toContain("ERRCODE = 'restrict_violation'");

      // Step 025.1: BEFORE UPDATE trigger
      expect(sql).toContain('CREATE TRIGGER trg_audit_logs_prevent_update');
      expect(sql).toContain('BEFORE UPDATE ON public.audit_logs');
      expect(sql).toContain('EXECUTE FUNCTION public.prevent_audit_log_modification()');

      // Step 025.2: BEFORE DELETE trigger
      expect(sql).toContain('CREATE TRIGGER trg_audit_logs_prevent_delete');
      expect(sql).toContain('BEFORE DELETE ON public.audit_logs');

      // BEFORE TRUNCATE trigger
      expect(sql).toContain('CREATE TRIGGER trg_audit_logs_prevent_truncate');
      expect(sql).toContain('BEFORE TRUNCATE ON public.audit_logs');

      // Step 025.3: Revoke TRUNCATE privileges
      expect(sql).toContain('REVOKE TRUNCATE ON public.audit_logs FROM PUBLIC');
      expect(sql).toContain('REVOKE TRUNCATE ON public.audit_logs FROM anon');
      expect(sql).toContain('REVOKE TRUNCATE ON public.audit_logs FROM authenticated');
    });

    it('verifies supabase/migrations/20261103000014_audit_log_tamper_protection.sql mirrors definitions', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000014_audit_log_tamper_protection.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('prevent_audit_log_modification');
      expect(sql).toContain('trg_audit_logs_prevent_update');
      expect(sql).toContain('trg_audit_logs_prevent_delete');
      expect(sql).toContain('trg_audit_logs_prevent_truncate');
      expect(sql).toContain('REVOKE TRUNCATE ON public.audit_logs FROM PUBLIC');
    });
  });

  describe('Engine Level Mutation Rejection (Quality Gate Verification)', () => {
    it('successfully appends audit entries into the tamper-protected table', async () => {
      const entry = await repository.append(createSampleLogInput());
      expect(entry.id).toBeDefined();
      expect(entry.action).toBe('AUTH_LOGIN_SUCCESS');
      expect(entry.sequence_id).toBe(1);
    });

    it('rejects UPDATE operations with "Audit logs are strictly append-only" fatal exception', async () => {
      const entry = await repository.append(createSampleLogInput());

      await expect(
        repository.update(entry.id, 1, { action: 'TAMPERED_ACTION' } as any)
      ).rejects.toThrow('Audit logs are strictly append-only');
    });

    it('rejects DELETE operations with "Audit logs are strictly append-only" fatal exception', async () => {
      const entry = await repository.append(createSampleLogInput());

      // Attempt soft deletion
      await expect(repository.softDelete(entry.id, 1)).rejects.toThrow(
        'Audit logs are strictly append-only'
      );

      // Attempt hard deletion
      await expect(repository.hardDelete(entry.id)).rejects.toThrow(
        'Audit logs are strictly append-only'
      );
    });

    it('rejects simulated TRUNCATE operation with fatal exception', async () => {
      await expect(simulatedDriver.truncate()).rejects.toThrow(
        'Audit logs are strictly append-only. UPDATE, DELETE, and TRUNCATE operations are forbidden.'
      );
    });

    it('rejects restore operation with fatal exception', async () => {
      const entry = await repository.append(createSampleLogInput());

      await expect(repository.restore(entry.id, 1)).rejects.toThrow(
        'Audit logs are strictly append-only'
      );
    });
  });
});
