// path: tests/database/migrations.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  parseMigrationFilename,
  calculateSqlChecksum,
  loadMigrationFiles,
  computeMigrationDiff,
} from '@/lib/database';
import type { MigrationRecord, MigrationFile } from '@/lib/database';

describe('Database Schema Design & Migration Tooling (Step 008)', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  describe('Migration File Parsing & Checksumming', () => {
    it('should correctly parse timestamp-versioned SQL migration filenames', () => {
      const parsed = parseMigrationFilename('20261103000001_init_extensions.sql');
      expect(parsed).not.toBeNull();
      expect(parsed?.version).toBe('20261103000001');
      expect(parsed?.name).toBe('init_extensions');
    });

    it('should reject malformed or non-timestamped filenames', () => {
      expect(parseMigrationFilename('invalid_name.sql')).toBeNull();
      expect(parseMigrationFilename('2026_short.sql')).toBeNull();
      expect(parseMigrationFilename('migration.txt')).toBeNull();
    });

    it('should generate deterministic SHA-256 checksums ignoring exterior whitespace', () => {
      const sql1 = 'CREATE EXTENSION IF NOT EXISTS "citext";\n';
      const sql2 = '  CREATE EXTENSION IF NOT EXISTS "citext";  ';
      expect(calculateSqlChecksum(sql1)).toBe(calculateSqlChecksum(sql2));
      expect(calculateSqlChecksum(sql1)).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Disk Migration Discovery & Verification', () => {
    it('should discover and load init_extensions migration from supabase/migrations', () => {
      const migrations = loadMigrationFiles(migrationsDir);
      expect(migrations.length).toBeGreaterThanOrEqual(1);

      const initMigration = migrations.find((m) => m.name === 'init_extensions');
      expect(initMigration).toBeDefined();
      expect(initMigration?.version).toBe('20261103000001');

      // Verify core extensions and functions in SQL
      expect(initMigration?.sql).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      expect(initMigration?.sql).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      expect(initMigration?.sql).toContain('CREATE EXTENSION IF NOT EXISTS "citext"');
      expect(initMigration?.sql).toContain('CREATE TABLE IF NOT EXISTS _schema_migrations');
      expect(initMigration?.sql).toContain('FUNCTION generate_uuid_v7()');
      expect(initMigration?.sql).toContain('FUNCTION update_updated_at_column()');
    });
  });

  describe('Migration Diff & State Computation', () => {
    it('should compute pending vs applied migrations accurately', () => {
      const mockAvailable: MigrationFile[] = [
        {
          version: '20261103000001',
          name: 'init_extensions',
          filepath: '/path/to/01.sql',
          sql: 'SELECT 1;',
          checksum: 'hash1',
        },
        {
          version: '20261103000002',
          name: 'create_tenants_table',
          filepath: '/path/to/02.sql',
          sql: 'SELECT 2;',
          checksum: 'hash2',
        },
      ];

      const mockApplied: MigrationRecord[] = [
        {
          version: '20261103000001',
          name: 'init_extensions',
          applied_at: '2026-11-03T00:00:00Z',
          checksum: 'hash1',
        },
      ];

      const diff = computeMigrationDiff(mockAvailable, mockApplied);

      expect(diff.appliedCount).toBe(1);
      expect(diff.pendingCount).toBe(1);
      expect(diff.pending[0]?.name).toBe('create_tenants_table');
      expect(diff.applied[0]?.name).toBe('init_extensions');
    });
  });
});
