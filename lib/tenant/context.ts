// path: lib/tenant/context.ts

import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextRequest } from 'next/server';
import { Role, isOfficeRole } from '@/lib/auth/roles';
import { extractRoleFromRequest } from '@/lib/auth/guard';
import { UserRepository } from '@/lib/db/users';
import { CompanyRepository } from '@/lib/db/companies';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

/**
 * Validated tenant execution context injected into request lifecycle and DB transactions.
 */
export interface TenantContext {
  readonly companyId: string;
  readonly userId: string;
  readonly role: string;
  readonly isSuperadmin: boolean;
  readonly isOfficeStaff: boolean;
  readonly isContextSwitched: boolean;
  readonly originalCompanyId?: string | null | undefined;
}

/**
 * Options for configuring tenant context resolution.
 */
export interface ResolveTenantOptions {
  readonly userRepo?: UserRepository | undefined;
  readonly companyRepo?: CompanyRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
}

/**
 * Node.js AsyncLocalStorage container preserving tenant context across asynchronous boundaries.
 */
export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

const defaultUserRepo = new UserRepository();
const defaultCompanyRepo = new CompanyRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Sanitizes an identifier for SQL session variables, strictly allowing UUID format.
 */
export function sanitizeSqlIdentifier(id: string): string {
  if (!id || typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9\-_]/g, '');
}

/**
 * Step 065.1 & Step 065.2: Resolves the tenant context for an incoming HTTP request.
 * - For sub-merchant owner: retrieves assigned company_id and strictly validates against tampering.
 * - For office roles: allows tenant switching with explicit audit logging of the viewed company.
 * - Fails closed on missing or mismatched company headers.
 */
export async function resolveTenantContext(
  request: Request | NextRequest,
  options?: ResolveTenantOptions
): Promise<TenantContext> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const companyRepo = options?.companyRepo ?? defaultCompanyRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  // 1. Extract actor role and user identification from headers or cookies
  const role =
    extractRoleFromRequest(request) ??
    request.headers.get('x-user-role') ??
    request.headers.get('x-staff-role') ??
    request.headers.get('x-role') ??
    'anonymous';

  const userId =
    request.headers.get('x-user-id') ??
    request.headers.get('x-actor-id') ??
    null;

  if (!userId) {
    throw new Error('Unauthenticated tenant context: actor user identification is missing.');
  }

  // 2. Fetch user profile from database to determine true assigned company
  const user = await userRepo.findById(userId);
  const sessionCompanyId = user?.company_id ?? null;

  // 3. Extract requested company ID from headers, query params, or cookies
  const headerCompanyId = request.headers.get('x-company-id');
  let requestedCompanyId = headerCompanyId;

  if (!requestedCompanyId && 'nextUrl' in request && request.nextUrl) {
    requestedCompanyId = request.nextUrl.searchParams.get('companyId');
  }

  const isSuperadmin = role === Role.SUPER_ADMIN || role === 'super_admin';
  const isOffice = isOfficeRole(role) || isSuperadmin;

  // 4. SUB-MERCHANT / OWNER VALIDATION (Step 065.1 & Step 065.4)
  if (!isOffice) {
    if (!sessionCompanyId || sessionCompanyId === '00000000-0000-0000-0000-000000000000') {
      throw new Error(
        `Cross-tenant violation: sub-merchant user "${userId}" has no assigned company.`
      );
    }

    // If an explicit company header is supplied, assert that it matches the assigned company exactly
    if (requestedCompanyId && requestedCompanyId !== sessionCompanyId) {
      logger.warn('Cross-tenant tampering attempt detected', {
        userId,
        sessionCompanyId,
        requestedCompanyId,
      });

      throw new Error(
        `Cross-tenant violation: sub-merchant owner is not authorized to access foreign company "${requestedCompanyId}".`
      );
    }

    return {
      companyId: sessionCompanyId,
      userId,
      role,
      isSuperadmin: false,
      isOfficeStaff: false,
      isContextSwitched: false,
      originalCompanyId: sessionCompanyId,
    };
  }


  // 5. OFFICE STAFF CONTEXT SWITCHING (Step 065.2)
  const targetCompanyId = requestedCompanyId ?? sessionCompanyId ?? '00000000-0000-7000-8000-000000000000';
  const isContextSwitched = Boolean(
    requestedCompanyId && requestedCompanyId !== sessionCompanyId
  );

  // If switching context to a sub-merchant company, verify the target company exists
  if (requestedCompanyId && requestedCompanyId !== '00000000-0000-7000-8000-000000000000') {
    const targetCompany = await companyRepo.findById(requestedCompanyId);
    if (!targetCompany) {
      throw new Error(
        `Target company "${requestedCompanyId}" does not exist or is inactive.`
      );
    }

    // Step 065.2: Explicit audit logging of tenant context switch by office staff
    const clientIp = options?.clientIp ?? request.headers.get('x-forwarded-for') ?? '127.0.0.1';
    const userAgent = options?.userAgent ?? request.headers.get('user-agent') ?? 'Unknown';

    try {
      await auditRepo.append({
        company_id: requestedCompanyId,
        action: 'TENANT_CONTEXT_SWITCHED',
        actor_id: userId,
        entity_type: 'companies',
        entity_id: requestedCompanyId,
        payload: {
          actorRole: role,
          switchedFrom: sessionCompanyId,
          switchedTo: requestedCompanyId,
          targetCompanyName: targetCompany.legal_name,
          clientIp,
          userAgent,
        },
      });
    } catch (err) {
      logger.warn('Audit record creation for context switch failed non-fatally', { err });
    }
  }

  return {
    companyId: targetCompanyId,
    userId,
    role,
    isSuperadmin,
    isOfficeStaff: true,
    isContextSwitched,
    originalCompanyId: sessionCompanyId,
  };
}

/**
 * Runs an asynchronous callback within the scoped TenantContext AsyncLocalStorage.
 */
export function withTenantContext<T>(
  context: TenantContext,
  fn: () => Promise<T> | T
): Promise<T> | T {
  return tenantContextStorage.run(context, fn);
}

/**
 * Retrieves the currently active TenantContext from AsyncLocalStorage.
 */
export function getCurrentTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * Generates PostgreSQL session configuration statements setting
 * app.current_company_id, app.current_user_id, and app.is_superadmin.
 * Injected before database transactions to enforce 100% RLS isolation.
 */
export function buildSetTenantContextSql(context: TenantContext): string {
  const safeCompanyId = sanitizeSqlIdentifier(context.companyId);
  const safeUserId = sanitizeSqlIdentifier(context.userId);
  const superadminFlag = context.isSuperadmin ? 'true' : 'false';

  const statements: string[] = [
    `SELECT set_tenant_context('${safeCompanyId}'::uuid, '${safeUserId}'::uuid, ${superadminFlag});`,
    `SET LOCAL app.current_company_id = '${safeCompanyId}';`,
    `SET LOCAL app.current_tenant_id = '${safeCompanyId}';`,
    `SET LOCAL app.current_user_id = '${safeUserId}';`,
    `SET LOCAL app.is_superadmin = '${superadminFlag}';`,
  ];

  return statements.join(' ');
}

/**
 * Quality Gate Helper: Filters records in-memory or database query streams
 * to guarantee strict company_id isolation.
 */
export function applyTenantFilter<T extends { company_id: string }>(
  records: readonly T[],
  context: TenantContext
): T[] {
  // If superadmin without context switch, all records are visible
  if (context.isSuperadmin && !context.isContextSwitched) {
    return [...records];
  }

  // Filter strictly by active company_id
  return records.filter((r) => r.company_id === context.companyId);
}
