// path: tests/db/rls.test.ts

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect } from 'vitest';
import { lintMigrationsForRls } from '../../scripts/lint-rls';
import { buildTenantSessionSql, validateTenantAccess, assertTenantAccess } from '../../lib/database';

describe('Step 019: Row Level Security (RLS) Default-Deny Policy Setup', () => {
  const supabaseMigrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const dbMigrationsDir = path.resolve(process.cwd(), 'db/migrations');

  describe('PostgreSQL Migration DDL & Default-Deny Directives', () => {
    it('verifies db/migrations/004_enable_rls_default_deny.sql enforces ENABLE and FORCE RLS', () => {
      const migrationFile = path.join(dbMigrationsDir, '004_enable_rls_default_deny.sql');
      expect(fs.existsSync(migrationFile)).toBe(true);

      const sql = fs.readFileSync(migrationFile, 'utf8');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('enable_and_force_rls');

      // Verify core tables explicitly forced
      const requiredTables = [
        'tenants',
        'tenant_settings',
        'tenant_memberships',
        'users',
        'user_sessions',
        'user_mfa',
      ];

      for (const table of requiredTables) {
        expect(sql).toMatch(
          new RegExp(`ALTER\\s+TABLE\\s+IF\\s+EXISTS\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i')
        );
        expect(sql).toMatch(
          new RegExp(`ALTER\\s+TABLE\\s+IF\\s+EXISTS\\s+public\\.${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i')
        );
      }
    });

    it('verifies supabase/migrations/20261103000008_enable_rls_default_deny.sql contains dynamic schema loop', () => {
      const migrationFile = path.join(
        supabaseMigrationsDir,
        '20261103000008_enable_rls_default_deny.sql'
      );
      expect(fs.existsSync(migrationFile)).toBe(true);

      const sql = fs.readFileSync(migrationFile, 'utf8');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION enable_and_force_rls');
      expect(sql).toContain('FORCE ROW LEVEL SECURITY');
      expect(sql).toContain('FOR tbl IN');
    });
  });

  describe('Automated Migration Linter Integration (scripts/lint-rls.ts)', () => {
    it('passes 100% of existing migrations on disk with zero unshielded tables', () => {
      const result = lintMigrationsForRls([supabaseMigrationsDir, dbMigrationsDir]);

      expect(result.passed).toBe(true);
      expect(result.unshieldedTables).toHaveLength(0);
      expect(result.unforcedTables).toHaveLength(0);
      expect(result.totalTables).toBeGreaterThanOrEqual(6);

      const checkedSet = new Set(result.tablesChecked);
      expect(checkedSet.has('tenants')).toBe(true);
      expect(checkedSet.has('users')).toBe(true);
      expect(checkedSet.has('tenant_memberships')).toBe(true);
      expect(checkedSet.has('user_sessions')).toBe(true);
      expect(checkedSet.has('user_mfa')).toBe(true);
    });

    it('catches and rejects synthetic migrations that create tables without RLS', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rls-lint-test-'));

      try {
        const vulnerableSql = `
          -- Synthetic migration missing RLS
          CREATE TABLE public.vulnerable_payments (
            id uuid PRIMARY KEY,
            amount numeric(18,4) NOT NULL
          );
        `;
        fs.writeFileSync(path.join(tempDir, '20261103999999_vulnerable_payments.sql'), vulnerableSql);

        const result = lintMigrationsForRls([tempDir]);
        expect(result.passed).toBe(false);
        expect(result.unshieldedTables).toContain('vulnerable_payments');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('validates synthetic migrations that properly include both ENABLE and FORCE RLS', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rls-lint-test-pass-'));

      try {
        const secureSql = `
          CREATE TABLE public.secure_ledger (
            id uuid PRIMARY KEY,
            balance numeric(18,4) NOT NULL
          );
          ALTER TABLE public.secure_ledger ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.secure_ledger FORCE ROW LEVEL SECURITY;
        `;
        fs.writeFileSync(path.join(tempDir, '20261103999999_secure_ledger.sql'), secureSql);

        const result = lintMigrationsForRls([tempDir]);
        expect(result.passed).toBe(true);
        expect(result.unshieldedTables).toHaveLength(0);
        expect(result.unforcedTables).toHaveLength(0);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Unauthenticated Default-Deny & Tenant Isolation Simulation', () => {
    interface MockRow {
      id: string;
      tenant_id: string;
      title: string;
    }

    const mockDatabase: MockRow[] = [
      { id: '1', tenant_id: '018f6c4c-1111-7fa1-b1e2-000000000001', title: 'Tenant 1 Invoice' },
      { id: '2', tenant_id: '018f6c4c-2222-7fa1-b1e2-000000000002', title: 'Tenant 2 Invoice' },
    ];

    /**
     * Simulates PostgreSQL RLS policy execution:
     * policy: tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.is_superadmin', true) = 'true'
     */
    function executeRlsQuery(sessionSettings: {
      tenantId?: string;
      isSuperadmin?: boolean;
    }): MockRow[] {
      const currentTenantId = sessionSettings.tenantId ?? '';
      const isSuperadmin = sessionSettings.isSuperadmin === true;

      return mockDatabase.filter((row) => {
        if (isSuperadmin) return true;
        if (!currentTenantId) return false; // Default Deny
        return row.tenant_id === currentTenantId;
      });
    }

    it('returns zero rows for unauthenticated queries without tenant session variables (default deny)', () => {
      // Unauthenticated query: no session settings provided
      const rows = executeRlsQuery({});
      expect(rows).toHaveLength(0);
      expect(rows).toEqual([]);
    });

    it('returns zero rows when tenant ID is blank or empty string', () => {
      const rows = executeRlsQuery({ tenantId: '' });
      expect(rows).toHaveLength(0);
    });

    it('returns only matching rows when authenticated as Tenant 1', () => {
      const rows = executeRlsQuery({ tenantId: '018f6c4c-1111-7fa1-b1e2-000000000001' });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toBe('Tenant 1 Invoice');
    });

    it('strictly prevents Tenant 1 session from viewing Tenant 2 rows', () => {
      const rows = executeRlsQuery({ tenantId: '018f6c4c-1111-7fa1-b1e2-000000000001' });
      const hasTenant2Data = rows.some((r) => r.tenant_id === '018f6c4c-2222-7fa1-b1e2-000000000002');
      expect(hasTenant2Data).toBe(false);
    });

    it('returns all rows across all tenants when authenticated as superadmin', () => {
      const rows = executeRlsQuery({ isSuperadmin: true });
      expect(rows).toHaveLength(2);
    });

    it('generates compliant SET LOCAL session SQL through buildTenantSessionSql', () => {
      const sqlUnauth = buildTenantSessionSql({});
      expect(sqlUnauth).toContain("SET LOCAL app.current_tenant_id = '';");
      expect(sqlUnauth).toContain("SET LOCAL app.is_superadmin = 'false';");

      const sqlTenant = buildTenantSessionSql({ tenantId: '018f6c4c-1111-7fa1-b1e2-000000000001' });
      expect(sqlTenant).toContain("SET LOCAL app.current_tenant_id = '018f6c4c-1111-7fa1-b1e2-000000000001';");

      const sqlSuperadmin = buildTenantSessionSql({ isSuperadmin: true });
      expect(sqlSuperadmin).toContain("SET LOCAL app.is_superadmin = 'true';");
    });

    it('throws Cross-Tenant Access Violation when assertTenantAccess evaluates foreign tenant', () => {
      const tenantA = '018f6c4c-1111-7fa1-b1e2-000000000001';
      const tenantB = '018f6c4c-2222-7fa1-b1e2-000000000002';

      expect(validateTenantAccess({ tenantId: tenantA }, tenantB)).toBe(false);
      expect(() => assertTenantAccess({ tenantId: tenantA }, tenantB)).toThrow(
        /Cross-Tenant Access Violation/
      );
    });
  });
});
