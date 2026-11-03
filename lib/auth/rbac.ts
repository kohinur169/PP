// path: lib/auth/rbac.ts
import type { MembershipRole } from '@/lib/database';
import type { Permission } from './rbac-types';
import { ROLE_PERMISSIONS } from './rbac-types';
import type { Rfc7807ProblemDetails } from '@/lib/validation';
import { logger } from '@/lib/logger';

// Pre-compiled fast O(1) Sets for permission evaluation
const ROLE_PERMISSION_SETS = new Map<MembershipRole, Set<Permission>>();

for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
  ROLE_PERMISSION_SETS.set(role as MembershipRole, new Set(permissions));
}

/**
 * Evaluates whether a role possesses a specific permission.
 * Superadmin flag immediately grants all permissions.
 */
export function hasPermission(
  role: MembershipRole,
  permission: Permission,
  isSuperadmin: boolean = false
): boolean {
  if (isSuperadmin) return true;
  const permissionSet = ROLE_PERMISSION_SETS.get(role);
  return permissionSet ? permissionSet.has(permission) : false;
}

/**
 * Evaluates whether a role possesses ALL of the specified permissions.
 */
export function hasAllPermissions(
  role: MembershipRole,
  permissions: Permission[],
  isSuperadmin: boolean = false
): boolean {
  if (isSuperadmin) return true;
  return permissions.every((p) => hasPermission(role, p, isSuperadmin));
}

/**
 * Evaluates whether a role possesses AT LEAST ONE of the specified permissions.
 */
export function hasAnyPermission(
  role: MembershipRole,
  permissions: Permission[],
  isSuperadmin: boolean = false
): boolean {
  if (isSuperadmin) return true;
  return permissions.some((p) => hasPermission(role, p, isSuperadmin));
}

/**
 * Asserts that a role possesses a required permission, throwing an Error if denied.
 */
export function assertPermission(
  role: MembershipRole,
  permission: Permission,
  isSuperadmin: boolean = false
): void {
  if (!hasPermission(role, permission, isSuperadmin)) {
    const errorMsg = `Access Denied: Role "${role}" lacks required permission "${permission}".`;
    logger.warn('RBAC permission check failed', { role, permission, isSuperadmin });
    throw new Error(errorMsg);
  }
}

/**
 * Creates a standard RFC 7807 403 Forbidden Problem Details HTTP response.
 */
export function createForbiddenResponse(
  permission: Permission,
  path?: string,
  correlationId?: string
): Response {
  const problem: Rfc7807ProblemDetails = {
    type: 'https://kdsolution.it/errors/forbidden',
    title: 'Forbidden - Insufficient Permissions',
    status: 403,
    detail: `You do not have the required permission (${permission}) to execute this action.`,
    instance: path,
    correlationId,
    timestamp: new Date().toISOString(),
  };

  return Response.json(problem, {
    status: 403,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

/**
 * Guards a server operation by verifying RBAC permissions before invocation.
 * Returns standard RFC 7807 403 Response if unauthorized.
 */
export async function requirePermission<T>(
  role: MembershipRole,
  permission: Permission,
  handler: () => Promise<T>,
  options?: { isSuperadmin?: boolean; path?: string; correlationId?: string }
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  const isSuperadmin = options?.isSuperadmin ?? false;

  if (!hasPermission(role, permission, isSuperadmin)) {
    logger.warn('Unauthorized operation attempted', {
      role,
      permission,
      path: options?.path,
      correlationId: options?.correlationId,
    });

    const forbiddenResponse = createForbiddenResponse(
      permission,
      options?.path,
      options?.correlationId
    );

    return {
      success: false,
      response: forbiddenResponse,
    };
  }

  const result = await handler();
  return {
    success: true,
    data: result,
  };
}
