// path: tests/db/tenant-isolation.test.ts

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildTenantSessionContextSql,
  buildClearTenantSessionSql,
  assertTenantIsolation,
  CrossTenantAccessViolationError,
  withTenantContext,
  getActiveSessionState,
  TenantConnectionPoolSimulator,
} from '../../lib/db/tenant';

describe('Step 020: PostgreSQL Tenant Session Variable Infrastructure', () => {
  const companyA = '018f6c4c-3500-7fa1-b1e2-aaaaaaaaaaaa';
  const companyB = '018f6c4c-3500-7fa1-b1e2-bbbbbbbbbbbb';
  const userA = '018f6c4c-4500-7fa1-b1e2-111111111111';

  describe('PostgreSQL Session Variable SQL Generators', () => {
    it('generates parameterized SET LOCAL statements for company and user isolation', () => {
      const sql = buildTenantSessionContextSql({
        companyId: companyA,
        userId: userA,
        isSuperadmin: false,
      });

      expect(sql).toContain(`SET LOCAL app.current_company_id = '${companyA}';`);
      expect(sql).toContain(`SET LOCAL app.current_tenant_id = '${companyA}';`);
      expect(sql).toContain(`SET LOCAL app.current_user_id = '${userA}';`);
      expect(sql).toContain(`SET LOCAL app.is_superadmin = 'false';`);
    });

    it('generates superadmin bypass session statements when isSuperadmin is true', () => {
      const sql = buildTenantSessionContextSql({
        companyId: null,
        userId: 'super_admin_uuid',
        isSuperadmin: true,
      });

      expect(sql).toContain(`SET LOCAL app.current_company_id = '';`);
      expect(sql).toContain(`SET LOCAL app.current_user_id = 'super_admin_uuid';`);
      expect(sql).toContain(`SET LOCAL app.is_superadmin = 'true';`);
    });

    it('sanitizes input preventing SQL injection in session identifiers', () => {
      const maliciousId = "comp'; DROP TABLE companies; --";
      const sql = buildTenantSessionContextSql({
        companyId: maliciousId,
      });

      expect(sql).not.toContain('DROP TABLE');
      expect(sql).toContain(`SET LOCAL app.current_company_id = 'compDROPTABLEcompanies--';`);
    });

    it('generates valid reset SQL statements via buildClearTenantSessionSql', () => {
      const clearSql = buildClearTenantSessionSql();

      expect(clearSql).toContain(`SET LOCAL app.current_company_id = '';`);
      expect(clearSql).toContain(`SET LOCAL app.current_tenant_id = '';`);
      expect(clearSql).toContain(`SET LOCAL app.current_user_id = '';`);
      expect(clearSql).toContain(`SET LOCAL app.is_superadmin = 'false';`);
    });
  });

  describe('withTenantContext Execution Wrapper & Cleanup', () => {
    it('sets active tenant state within callback and restores prior state on completion', async () => {
      expect(getActiveSessionState().companyId).toBeNull();

      const result = await withTenantContext(companyA, userA, async (ctx) => {
        expect(ctx.companyId).toBe(companyA);
        expect(ctx.userId).toBe(userA);
        expect(ctx.isSuperadmin).toBe(false);

        const inFlight = getActiveSessionState();
        expect(inFlight.companyId).toBe(companyA);
        expect(inFlight.userId).toBe(userA);

        return 'execution_success';
      });

      expect(result).toBe('execution_success');
      // State must be completely restored after execution
      expect(getActiveSessionState().companyId).toBeNull();
    });

    it('cleans up active tenant state even when callback throws an error', async () => {
      expect(getActiveSessionState().companyId).toBeNull();

      await expect(
        withTenantContext(companyA, userA, async () => {
          throw new Error('Database transaction aborted');
        })
      ).rejects.toThrow('Database transaction aborted');

      // State must still be reset in finally block
      expect(getActiveSessionState().companyId).toBeNull();
    });

    it('handles nested withTenantContext execution without state contamination', async () => {
      await withTenantContext(companyA, userA, async (outerCtx) => {
        expect(outerCtx.companyId).toBe(companyA);

        // Nested call for temporary cross-tenant check (e.g. system sub-task)
        await withTenantContext(companyB, null, async (innerCtx) => {
          expect(innerCtx.companyId).toBe(companyB);
          expect(getActiveSessionState().companyId).toBe(companyB);
        });

        // Outer context restored
        expect(getActiveSessionState().companyId).toBe(companyA);
      });

      expect(getActiveSessionState().companyId).toBeNull();
    });

    it('rejects execution if companyId is missing and not superadmin', async () => {
      // @ts-expect-error testing missing companyId guard
      await expect(withTenantContext(null, null, async () => {})).rejects.toThrow(
        /companyId is required/
      );
    });
  });

  describe('Cross-Tenant Boundary Assertion', () => {
    it('permits access when context company matches target company', () => {
      expect(() => assertTenantIsolation(companyA, companyA)).not.toThrow();
    });

    it('throws CrossTenantAccessViolationError when accessing foreign company', () => {
      expect(() => assertTenantIsolation(companyA, companyB)).toThrow(
        CrossTenantAccessViolationError
      );

      try {
        assertTenantIsolation(companyA, companyB);
      } catch (err) {
        expect(err).toBeInstanceOf(CrossTenantAccessViolationError);
        const violation = err as CrossTenantAccessViolationError;
        expect(violation.contextCompanyId).toBe(companyA);
        expect(violation.targetCompanyId).toBe(companyB);
      }
    });

    it('allows superadmin full bypass across any company target', () => {
      expect(() => assertTenantIsolation(companyA, companyB, true)).not.toThrow();
      expect(() => assertTenantIsolation(null, companyB, true)).not.toThrow();
    });
  });

  describe('Connection Pool Reuse & Concurrent Isolation Simulation (Quality Gate)', () => {
    it('guarantees complete isolation between Company 1 and Company 2 across pooled connections', async () => {
      const pool = new TenantConnectionPoolSimulator();

      interface RecordRow {
        id: string;
        company_id: string;
        amount_usd: string;
      }

      const mockDb: RecordRow[] = [
        { id: '1', company_id: companyA, amount_usd: '100.0000' },
        { id: '2', company_id: companyB, amount_usd: '250.0000' },
      ];

      function queryWithConnection(connId: string): RecordRow[] {
        const session = pool.inspectConnection(connId);
        if (session.isSuperadmin) return mockDb;
        if (!session.companyId) return []; // Default deny
        return mockDb.filter((r) => r.company_id === session.companyId);
      }

      // Simulate Request 1 (Company A) on Connection pool slot "conn-01"
      pool.acquireConnection('conn-01', companyA, userA);
      const rowsA = queryWithConnection('conn-01');

      expect(rowsA).toHaveLength(1);
      expect(rowsA[0]?.company_id).toBe(companyA);
      expect(rowsA[0]?.amount_usd).toBe('100.0000');

      // Simulate Concurrent Request 2 (Company B) on Connection pool slot "conn-02"
      pool.acquireConnection('conn-02', companyB, null);
      const rowsB = queryWithConnection('conn-02');

      expect(rowsB).toHaveLength(1);
      expect(rowsB[0]?.company_id).toBe(companyB);
      expect(rowsB[0]?.amount_usd).toBe('250.0000');

      // Verify Company A connection CANNOT see Company B data
      expect(rowsA.some((r) => r.company_id === companyB)).toBe(false);

      // Verify Company B connection CANNOT see Company A data
      expect(rowsB.some((r) => r.company_id === companyA)).toBe(false);

      // Release Connection conn-01 back to pool
      pool.releaseConnection('conn-01');
      expect(queryWithConnection('conn-01')).toHaveLength(0); // Safely reset to empty

      // Reuse Connection conn-01 for Request 3 (Company B)
      pool.acquireConnection('conn-01', companyB, null);
      const rowsReused = queryWithConnection('conn-01');
      expect(rowsReused).toHaveLength(1);
      expect(rowsReused[0]?.company_id).toBe(companyB);
      // Zero residual data from Company A
      expect(rowsReused.some((r) => r.company_id === companyA)).toBe(false);

      pool.releaseConnection('conn-01');
      pool.releaseConnection('conn-02');
    });
  });

  describe('PostgreSQL Migration DDL & Helper Functions Integrity', () => {
    it('verifies db/migrations/005_tenant_session_functions.sql contains set/clear functions', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'db/migrations/005_tenant_session_functions.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION set_tenant_context');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION clear_tenant_context');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION get_current_company_id');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION is_current_superadmin');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION apply_tenant_isolation_policy');
      expect(sql).toContain('app.current_company_id');
      expect(sql).toContain('app.current_tenant_id');
    });

    it('verifies supabase/migrations/20261103000009_tenant_session_functions.sql contains comment descriptors', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261103000009_tenant_session_functions.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('COMMENT ON FUNCTION set_tenant_context');
      expect(sql).toContain('COMMENT ON FUNCTION clear_tenant_context');
      expect(sql).toContain('COMMENT ON FUNCTION get_current_company_id');
      expect(sql).toContain('COMMENT ON FUNCTION apply_tenant_isolation_policy');
    });
  });
});
