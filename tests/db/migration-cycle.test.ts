// path: tests/db/migration-cycle.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  loadMigrationFiles,
  loadRollbackFiles,
  parseMigrationFilename,
  calculateSqlChecksum,
  computeMigrationDiff,
} from '../../lib/database';
import {
  validateRollbackCompleteness,
  inspectSchemaTeardownCompleteness,
  runForwardMigrations,
  runRollbackMigrations,
  executeMigrationCycle,
} from '../../lib/database/runner';
import type { MigrationRecord } from '../../lib/database/types';

describe('Step 029: Database Migration Runner & Forward/Rollback Testing Harness', () => {
  const supabaseMigrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const dbMigrationsDir = path.resolve(process.cwd(), 'db/migrations');

  describe('Migration Filename Parsing and Checksums', () => {
    it('correctly parses ISO timestamped up and down migration files', () => {
      const parsedUp = parseMigrationFilename('20261103000001_init_extensions.sql');
      expect(parsedUp).not.toBeNull();
      expect(parsedUp?.version).toBe('20261103000001');
      expect(parsedUp?.name).toBe('init_extensions');
      expect(parsedUp?.direction).toBe('up');

      const parsedDown = parseMigrationFilename('20261103000001_init_extensions.down.sql');
      expect(parsedDown).not.toBeNull();
      expect(parsedDown?.version).toBe('20261103000001');
      expect(parsedDown?.name).toBe('init_extensions');
      expect(parsedDown?.direction).toBe('down');
    });

    it('correctly parses sequential numeric up and down migration files', () => {
      const parsedUp = parseMigrationFilename('006_create_companies_table.sql');
      expect(parsedUp).not.toBeNull();
      expect(parsedUp?.version).toBe('006');
      expect(parsedUp?.name).toBe('create_companies_table');
      expect(parsedUp?.direction).toBe('up');

      const parsedDown = parseMigrationFilename('006_create_companies_table.down.sql');
      expect(parsedDown).not.toBeNull();
      expect(parsedDown?.version).toBe('006');
      expect(parsedDown?.name).toBe('create_companies_table');
      expect(parsedDown?.direction).toBe('down');
    });

    it('calculates deterministic 64-character SHA-256 checksums', () => {
      const sqlA = 'CREATE TABLE test (id uuid PRIMARY KEY);';
      const sqlB = 'CREATE TABLE test (id uuid PRIMARY KEY); ';
      const checksumA = calculateSqlChecksum(sqlA);
      const checksumB = calculateSqlChecksum(sqlB);

      expect(checksumA).toHaveLength(64);
      expect(checksumA).toBe(checksumB); // Trimmed equality
    });
  });

  describe('Migration Directory Discovery & Rollback Pairing', () => {
    it('discovers and pairs all supabase/migrations with matching .down.sql scripts', () => {
      const migrations = loadMigrationFiles(supabaseMigrationsDir);
      expect(migrations.length).toBeGreaterThan(0);

      for (const m of migrations) {
        expect(m.downFilepath).toBeDefined();
        expect(m.downSql).toBeDefined();
        expect(m.downSql?.length).toBeGreaterThan(0);
      }
    });

    it('discovers and pairs all db/migrations with matching .down.sql scripts', () => {
      const migrations = loadMigrationFiles(dbMigrationsDir);
      expect(migrations.length).toBeGreaterThan(0);

      for (const m of migrations) {
        expect(m.downFilepath).toBeDefined();
        expect(m.downSql).toBeDefined();
        expect(m.downSql?.length).toBeGreaterThan(0);
      }
    });

    it('validates 100% rollback completeness in both migration directories', () => {
      const resSupabase = validateRollbackCompleteness(supabaseMigrationsDir);
      expect(resSupabase.valid).toBe(true);
      expect(resSupabase.missingDown).toHaveLength(0);

      const resDb = validateRollbackCompleteness(dbMigrationsDir);
      expect(resDb.valid).toBe(true);
      expect(resDb.missingDown).toHaveLength(0);
    });

    it('detects missing rollback scripts when an un-paired migration exists', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-migration-test-'));
      try {
        fs.writeFileSync(path.join(tmpDir, '001_first.sql'), 'SELECT 1;');
        fs.writeFileSync(path.join(tmpDir, '001_first.down.sql'), 'SELECT 1;');
        fs.writeFileSync(path.join(tmpDir, '002_second.sql'), 'SELECT 2;'); // missing .down.sql

        const check = validateRollbackCompleteness(tmpDir);
        expect(check.valid).toBe(false);
        expect(check.missingDown).toContain('002_second');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Schema Teardown and Orphan Object Inspection', () => {
    it('ensures all created tables in supabase/migrations have corresponding drop statements', () => {
      const teardown = inspectSchemaTeardownCompleteness(supabaseMigrationsDir);
      expect(teardown.clean).toBe(true);
      expect(teardown.orphanedTables).toEqual([]);
      expect(teardown.createdTables.length).toBeGreaterThan(0);
      expect(teardown.droppedTables).toEqual(expect.arrayContaining(teardown.createdTables));
    });

    it('ensures all created tables in db/migrations have corresponding drop statements', () => {
      const teardown = inspectSchemaTeardownCompleteness(dbMigrationsDir);
      expect(teardown.clean).toBe(true);
      expect(teardown.orphanedTables).toEqual([]);
      expect(teardown.createdTables.length).toBeGreaterThan(0);
      expect(teardown.droppedTables).toEqual(expect.arrayContaining(teardown.createdTables));
    });

    it('flags orphaned tables if a table is created but not dropped', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-orphan-test-'));
      try {
        fs.writeFileSync(
          path.join(tmpDir, '001_create_ghost.sql'),
          'CREATE TABLE ghost_table (id uuid PRIMARY KEY);'
        );
        fs.writeFileSync(
          path.join(tmpDir, '001_create_ghost.down.sql'),
          '-- empty down file forgot to drop table'
        );

        const check = inspectSchemaTeardownCompleteness(tmpDir);
        expect(check.clean).toBe(false);
        expect(check.orphanedTables).toContain('ghost_table');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Forward & Rollback Execution Runner', () => {
    it('executes forward migrations and records execution time with checksums', async () => {
      const executed: string[] = [];
      const applied: MigrationRecord[] = [];

      const { results, newAppliedRecords } = await runForwardMigrations({
        migrationsDir: dbMigrationsDir,
        appliedRecords: applied,
        steps: 3,
        executor: async (sql, version, direction) => {
          executed.push(`${direction}:${version}`);
        },
      });

      expect(results).toHaveLength(3);
      expect(newAppliedRecords).toHaveLength(3);
      expect(executed).toHaveLength(3);

      for (const res of results) {
        expect(res.success).toBe(true);
        expect(res.direction).toBe('up');
        expect(res.execution_time_ms).toBeGreaterThanOrEqual(0);
        expect(res.checksum).toHaveLength(64);
      }
    });

    it('executes rollback migrations in reverse order (LIFO)', async () => {
      const executed: string[] = [];
      const applied: MigrationRecord[] = [
        {
          version: '002',
          name: 'uuidv7_function',
          applied_at: new Date().toISOString(),
          checksum: 'test-chk-002',
          execution_time_ms: 12,
        },
        {
          version: '003',
          name: 'base_columns_and_triggers',
          applied_at: new Date().toISOString(),
          checksum: 'test-chk-003',
          execution_time_ms: 15,
        },
      ];

      const { results, remainingAppliedRecords } = await runRollbackMigrations({
        migrationsDir: dbMigrationsDir,
        appliedRecords: applied,
        steps: 2,
        executor: async (sql, version, direction) => {
          executed.push(`${direction}:${version}`);
        },
      });

      expect(results).toHaveLength(2);
      expect(remainingAppliedRecords).toHaveLength(0);
      // Descending order of rollbacks: 003 first, then 002
      expect(executed).toEqual(['down:003', 'down:002']);
    });
  });

  describe('Full Migration Forward/Rollback Test Cycle', () => {
    it('completes full cycle with zero orphaned schema objects on db/migrations', async () => {
      const cycleResult = await executeMigrationCycle({
        migrationsDir: dbMigrationsDir,
        executor: async () => {},
      });

      expect(cycleResult.passed).toBe(true);
      expect(cycleResult.forwardApplied).toBeGreaterThanOrEqual(10);
      expect(cycleResult.rollbackReverted).toBe(cycleResult.forwardApplied);
      expect(cycleResult.orphanedObjectsCount).toBe(0);
      expect(cycleResult.errors).toHaveLength(0);
      expect(cycleResult.forwardExecutionTimeMs).toBeGreaterThanOrEqual(0);
      expect(cycleResult.rollbackExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('completes full cycle with zero orphaned schema objects on supabase/migrations', async () => {
      const cycleResult = await executeMigrationCycle({
        migrationsDir: supabaseMigrationsDir,
        executor: async () => {},
      });

      expect(cycleResult.passed).toBe(true);
      expect(cycleResult.forwardApplied).toBeGreaterThanOrEqual(15);
      expect(cycleResult.rollbackReverted).toBe(cycleResult.forwardApplied);
      expect(cycleResult.orphanedObjectsCount).toBe(0);
      expect(cycleResult.errors).toHaveLength(0);
    });
  });
});
