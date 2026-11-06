// path: lib/security/audit-guard.ts

import { logger } from '../logger';
import { Rfc7807ProblemDetails } from '../validation';

/**
 * Platform roles explicitly authorized to export cryptographic audit logs and Merkle manifests.
 * In accordance with Step 028.4, strictly restricted to compliance_kyc and super_admin roles.
 */
export const AUDIT_EXPORT_PERMITTED_ROLES = new Set<string>([
  'super_admin',
  'compliance_kyc',
  'compliance_officer',
]);

/**
 * Checks whether an actor role or superadmin status grants authority to export audit logs.
 *
 * @param role - Role string of the requesting actor.
 * @param isSuperadmin - Boolean flag indicating platform superadmin privilege.
 * @returns true if export is allowed, false otherwise.
 */
export function canExportAuditLogs(
  role?: string | null,
  isSuperadmin = false
): boolean {
  if (isSuperadmin) {
    return true;
  }
  if (!role) {
    return false;
  }
  return AUDIT_EXPORT_PERMITTED_ROLES.has(role.toLowerCase().trim());
}

/**
 * Asserts that the actor possesses audit log export permissions, throwing an Error if denied.
 *
 * @param role - Role string of the requesting actor.
 * @param isSuperadmin - Boolean flag indicating platform superadmin privilege.
 * @throws Error when export authorization is rejected.
 */
export function assertCanExportAuditLogs(
  role?: string | null,
  isSuperadmin = false
): void {
  if (!canExportAuditLogs(role, isSuperadmin)) {
    logger.warn('Audit log export authorization denied', {
      role: role ?? 'anonymous',
      isSuperadmin,
    });
    throw new Error(
      `Access Denied: Audit log export is strictly restricted to compliance_kyc and super_admin roles. Provided role: "${role ?? 'anonymous'}".`
    );
  }
}

/**
 * Creates a standard RFC 7807 403 Forbidden HTTP Response for rejected audit export attempts.
 */
export function createAuditExportForbiddenResponse(
  instancePath = '/api/compliance/audit/export',
  correlationId?: string
): Response {
  const problem: Rfc7807ProblemDetails = {
    type: 'https://kdsolution.it/errors/audit-export-forbidden',
    title: 'Forbidden - Insufficient Audit Export Privileges',
    status: 403,
    detail:
      'Audit log and Merkle root batch exports are restricted exclusively to compliance_kyc and super_admin roles.',
    instance: instancePath,
    correlationId,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(problem), {
    status: 403,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Extracts staff identity, role, and superadmin status from incoming HTTP request headers.
 * Supports standard office gateway headers:
 * - x-staff-role / x-user-role
 * - x-user-id / x-staff-id
 * - x-is-superadmin / x-superadmin
 */
export function extractStaffIdentityFromHeaders(headers: Headers): {
  readonly userId: string | null;
  readonly role: string | null;
  readonly isSuperadmin: boolean;
} {
  const role =
    headers.get('x-staff-role') ||
    headers.get('x-user-role') ||
    headers.get('role');

  const userId =
    headers.get('x-staff-id') ||
    headers.get('x-user-id') ||
    headers.get('user-id');

  const superadminHeader =
    headers.get('x-is-superadmin') ||
    headers.get('x-superadmin');

  const isSuperadmin =
    superadminHeader === 'true' ||
    superadminHeader === '1' ||
    role?.toLowerCase() === 'super_admin';

  return {
    userId: userId?.trim() || null,
    role: role?.trim().toLowerCase() || null,
    isSuperadmin,
  };
}
