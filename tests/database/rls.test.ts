// path: tests/database/rls.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  buildTenantSessionSql,
  validateTenantAccess,
  assertTenantAccess,
  loadMigrationFiles,
} from '@/lib/database';
import type { TenantContext } from '@/lib/database';

describe('Multi-Tenant Architecture & PostgreSQL Row-Level Security (Step 009)', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  describe('PostgreSQL Session Variable Generator', () => {
    it('should generate valid SET LOCAL statements for tenant isolation', () => {
      const context: TenantContext = {
        tenantId: '018f6c4c-3500-7fa1-b1e2-123456789abc',
        userId: '018f6c4c-4500-7fa1-b1e2-987654321def',
        isSuperadmin: false,
      };

      const sql = buildTenantSessionSql(context);
      expect(sql).toContain("SET LOCAL app.current_tenant_id = '018f6c4c-3500-7fa1-b1e2-123456789abc';");
      expect(sql).toContain("SET LOCAL app.current_user_id = '018f6c4c-4500-7fa1-b1e2-987654321def';");
      expect(sql).toContain("SET LOCAL app.is_superadmin = 'false';");
    });

    it('should configure superadmin bypass flag when isSuperadmin is true', () => {
      const context: TenantContext = {
        tenantId: undefined,
        userId: 'admin_user_01',
        isSuperadmin: true,
      };

      const sql = buildTenantSessionSql(context);
      expect(sql).toContain("SET LOCAL app.current_tenant_id = '';");
      expect(sql).toContain("SET LOCAL app.is_superadmin = 'true';");
    });

    it('should sanitize identifiers preventing SQL injection in session settings', () => {
      const maliciousContext: TenantContext = {
        tenantId: "tenant'; DROP TABLE tenants; --",
      };

      const sql = buildTenantSessionSql(maliciousContext);
      expect(sql).not.toContain("DROP TABLE");
      expect(sql).toContain("SET LOCAL app.current_tenant_id = 'tenantDROPTABLEtenants--';");
    });
  });

  describe('Tenant Boundary & Access Validator', () => {
    const tenantA = '018f6c4c-1111-7fa1-b1e2-000000000001';
    const tenantB = '018f6c4c-2222-7fa1-b1e2-000000000002';

    it('should grant access when tenant IDs match', () => {
      const context: TenantContext = { tenantId: tenantA };
      expect(validateTenantAccess(context, tenantA)).toBe(true);
      expect(() => assertTenantAccess(context, tenantA)).not.toThrow();
    });

    it('should strictly deny cross-tenant access when querying another tenant', () => {
      const contextA: TenantContext = { tenantId: tenantA };
      expect(validateTenantAccess(contextA, tenantB)).toBe(false);
      expect(() => assertTenantAccess(contextA, tenantB)).toThrowError(
        /Cross-Tenant Access Violation/
      );
    });

    it('should allow superadmin full tenant traversal without restriction', () => {
      const superadminContext: TenantContext = {
        userId: 'super_admin_id',
        isSuperadmin: true,
      };

      expect(validateTenantAccess(superadminContext, tenantA)).toBe(true);
      expect(validateTenantAccess(superadminContext, tenantB)).toBe(true);
      expect(() => assertTenantAccess(superadminContext, tenantB)).not.toThrow();
    });
  });

  describe('RLS Migration DDL Verification', () => {
    it('should define RLS policies and UUIDv7 primary keys on all tenant tables', () => {
      const migrations = loadMigrationFiles(migrationsDir);
      const rlsMigration = migrations.find((m) => m.name === 'create_tenants_and_rls');

      expect(rlsMigration).toBeDefined();
      const sql = rlsMigration!.sql;

      // Table definitions
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS tenants');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS tenant_settings');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS users');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS tenant_memberships');

      // Row-Level Security enablement
      expect(sql).toContain('ALTER TABLE tenants ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE users ENABLE ROW LEVEL SECURITY');

      // Tenant isolation policy checking current_setting
      expect(sql).toContain("current_setting('app.current_tenant_id', true)");
      expect(sql).toContain("current_setting('app.is_superadmin', true)");

      // USD currency check constraint
      expect(sql).toContain("CHECK (default_currency = 'USD')");

      // Timestamp trigger attachment
      expect(sql).toContain('EXECUTE FUNCTION update_updated_at_column()');
    });
  });
});
