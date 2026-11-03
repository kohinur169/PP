// path: lib/database/tenant-context.ts
import type { TenantContext } from './tenant-types';

/**
 * Sanitizes an identifier for SQL session variables, strictly allowing only
 * alphanumeric characters, hyphens, and underscores (e.g. UUIDs and slugs).
 */
export function sanitizeSessionIdentifier(id: string): string {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9\-_]/g, '');
}

/**
 * Generates PostgreSQL session configuration statements setting
 * app.current_tenant_id, app.current_user_id, and app.is_superadmin.
 * These session variables are evaluated directly by Row-Level Security (RLS) policies.
 */
export function buildTenantSessionSql(context: TenantContext): string {
  const statements: string[] = [];

  if (context.tenantId) {
    const safeTenantId = sanitizeSessionIdentifier(context.tenantId);
    statements.push(`SET LOCAL app.current_tenant_id = '${safeTenantId}';`);
  } else {
    statements.push(`SET LOCAL app.current_tenant_id = '';`);
  }

  if (context.userId) {
    const safeUserId = sanitizeSessionIdentifier(context.userId);
    statements.push(`SET LOCAL app.current_user_id = '${safeUserId}';`);
  } else {
    statements.push(`SET LOCAL app.current_user_id = '';`);
  }

  if (context.isSuperadmin) {
    statements.push(`SET LOCAL app.is_superadmin = 'true';`);
  } else {
    statements.push(`SET LOCAL app.is_superadmin = 'false';`);
  }

  return statements.join(' ');
}

/**
 * Validates whether the active context has permission to access targetTenantId.
 * Superadmin bypasses tenant matching; all other users must match exact tenantId.
 */
export function validateTenantAccess(
  context: TenantContext,
  targetTenantId: string
): boolean {
  if (context.isSuperadmin) {
    return true;
  }

  if (!context.tenantId || !targetTenantId) {
    return false;
  }

  return context.tenantId === targetTenantId;
}

/**
 * Throws a SecurityError if the current execution context attempts to access a different tenant.
 */
export function assertTenantAccess(
  context: TenantContext,
  targetTenantId: string
): void {
  if (!validateTenantAccess(context, targetTenantId)) {
    throw new Error(
      `Cross-Tenant Access Violation: Context tenant "${context.tenantId ?? 'anonymous'}" attempted to access tenant "${targetTenantId}"`
    );
  }
}
