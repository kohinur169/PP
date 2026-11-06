// path: lib/audit/rbac.ts

import crypto from 'node:crypto';
import { Role, isOfficeRole } from '@/lib/auth/roles';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

/**
 * Platform privilege tiers used to evaluate permission elevation vs delegation.
 */
export const ROLE_PRIVILEGE_TIERS: Readonly<Record<Role, number>> = {
  [Role.SUPER_ADMIN]: 5,
  [Role.CEO]: 4,
  [Role.COMPLIANCE_KYC]: 3,
  [Role.FINANCE_OPS]: 2,
  [Role.SUPPORT]: 1,
  [Role.BLOGGER]: 0,
  [Role.OWNER]: -1,
  [Role.CLIENT]: -2,
};

/**
 * Enterprise Security Alert dispatched upon office role delegation or elevation.
 */
export interface SecurityAlert {
  readonly id: string;
  readonly recipientRole: Role;
  readonly severity: 'HIGH' | 'CRITICAL';
  readonly type: 'ROLE_ELEVATION' | 'ROLE_DELEGATION' | 'PERMISSION_CHANGE';
  readonly actorId: string;
  readonly targetUserId: string;
  readonly oldRole: Role;
  readonly newRole: Role;
  readonly reason: string;
  readonly ipAddress: string;
  readonly timestamp: string;
  readonly message: string;
}

/**
 * Complete audit record for a permission grant, role change, or privileged delegation.
 */
export interface PermissionChangeAuditEntry {
  readonly id: string;
  readonly actorId: string;
  readonly targetUserId: string;
  readonly oldRole: Role;
  readonly newRole: Role;
  readonly reason: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly timestamp: string;
  readonly isElevation: boolean;
  readonly alertsDispatched: readonly SecurityAlert[];
  readonly auditLogId?: string | undefined;
}

export interface LogPermissionChangeOptions {
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly companyId?: string | undefined;
}

// In-memory queues for alerts and entries
const dispatchedSecurityAlerts: SecurityAlert[] = [];
const permissionAuditRegistry: PermissionChangeAuditEntry[] = [];
const defaultAuditRepo = new AuditLogRepository();

/**
 * Evaluates whether a role transition constitutes a privilege elevation.
 */
export function isRoleElevation(oldRole: Role, newRole: Role): boolean {
  const oldTier = ROLE_PRIVILEGE_TIERS[oldRole] ?? -1;
  const newTier = ROLE_PRIVILEGE_TIERS[newRole] ?? -1;
  return newTier > oldTier;
}

/**
 * Step 075.2: Triggers automated security alert to CEO and Super Admin whenever an office role
 * is delegated or elevated.
 */
export function triggerSecurityAlerts(
  actorId: string,
  targetUserId: string,
  oldRole: Role,
  newRole: Role,
  reason: string,
  ipAddress: string,
  timestamp: string
): SecurityAlert[] {
  const isElevation = isRoleElevation(oldRole, newRole);
  const severity: 'HIGH' | 'CRITICAL' =
    newRole === Role.SUPER_ADMIN || newRole === Role.CEO ? 'CRITICAL' : 'HIGH';
  const alertType: 'ROLE_ELEVATION' | 'ROLE_DELEGATION' = isElevation
    ? 'ROLE_ELEVATION'
    : 'ROLE_DELEGATION';

  const executiveRecipients: Role[] = [Role.CEO, Role.SUPER_ADMIN];
  const generatedAlerts: SecurityAlert[] = [];

  for (const recipientRole of executiveRecipients) {
    const alert: SecurityAlert = {
      id: `alert_${crypto.randomUUID()}`,
      recipientRole,
      severity,
      type: alertType,
      actorId,
      targetUserId,
      oldRole,
      newRole,
      reason,
      ipAddress,
      timestamp,
      message: `[SECURITY NOTICE] Staff role changed from "${oldRole}" to "${newRole}" for user ${targetUserId} by actor ${actorId}. Reason: "${reason}". IP: ${ipAddress}.`,
    };
    generatedAlerts.push(alert);
    dispatchedSecurityAlerts.push(alert);
  }

  logger.warn('Automated security alert dispatched to executive office', {
    targetUserId,
    actorId,
    oldRole,
    newRole,
    severity,
    recipients: executiveRecipients,
  });

  return generatedAlerts;
}

/**
 * Step 075.1: Logs every permission grant, role change, and privileged action execution.
 * Creates an immutable cryptographic hash-chained audit log entry and dispatches security alerts.
 */
export async function logPermissionChange(
  actorId: string,
  targetUserId: string,
  oldRole: Role | string,
  newRole: Role | string,
  reason: string,
  options?: LogPermissionChangeOptions
): Promise<PermissionChangeAuditEntry> {
  if (!actorId || actorId.trim().length === 0) {
    throw new Error('Granting actor ID is required for permission audit logging.');
  }

  if (!targetUserId || targetUserId.trim().length === 0) {
    throw new Error('Recipient target user ID is required for permission audit logging.');
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error('Justification reason must be at least 5 characters long.');
  }

  const normalizedOldRole = oldRole as Role;
  const normalizedNewRole = newRole as Role;
  const isElevation = isRoleElevation(normalizedOldRole, normalizedNewRole);
  const ipAddress = options?.ipAddress ?? '127.0.0.1';
  const userAgent = options?.userAgent ?? 'Internal-RBAC-Engine/1.0';
  const timestamp = new Date().toISOString();
  const entryId = `perm_audit_${crypto.randomUUID()}`;

  // Step 075.2: Automated alerts for office role transitions
  let alertsDispatched: SecurityAlert[] = [];
  if (isOfficeRole(normalizedNewRole) || isOfficeRole(normalizedOldRole) || isElevation) {
    alertsDispatched = triggerSecurityAlerts(
      actorId,
      targetUserId,
      normalizedOldRole,
      normalizedNewRole,
      reason,
      ipAddress,
      timestamp
    );
  }

  // Immutable hash-chained audit log creation
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  let auditLogId: string | undefined;

  try {
    const auditRecord = await auditRepo.createLog({
      company_id: options?.companyId ?? '00000000-0000-7000-8000-000000000000',
      actor_id: actorId,
      action: 'STAFF_ROLE_DELEGATED',
      entity_type: 'user_role',
      entity_id: targetUserId,
      payload: {
        actorId,
        targetUserId,
        oldRole: normalizedOldRole,
        newRole: normalizedNewRole,
        isElevation,
        reason,
        ipAddress,
        userAgent,
        alertsDispatched: alertsDispatched.map((a) => ({
          id: a.id,
          recipientRole: a.recipientRole,
          severity: a.severity,
        })),
        timestamp,
      },
    });
    auditLogId = auditRecord.id;
  } catch (err: unknown) {
    logger.error('Failed to append to audit log repository in logPermissionChange', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const entry: PermissionChangeAuditEntry = {
    id: entryId,
    actorId,
    targetUserId,
    oldRole: normalizedOldRole,
    newRole: normalizedNewRole,
    reason,
    ipAddress,
    userAgent,
    timestamp,
    isElevation,
    alertsDispatched,
    auditLogId,
  };

  permissionAuditRegistry.unshift(entry);

  return entry;
}

/**
 * Retrieves all dispatched executive security alerts.
 */
export function getDispatchedSecurityAlerts(): readonly SecurityAlert[] {
  return [...dispatchedSecurityAlerts];
}

/**
 * Clears the dispatched security alerts queue (primarily for test resets).
 */
export function clearDispatchedSecurityAlerts(): void {
  dispatchedSecurityAlerts.length = 0;
}

/**
 * Retrieves recorded permission change audit entries.
 */
export function getPermissionChangeAuditEntries(filter?: {
  readonly targetUserId?: string | undefined;
  readonly actorId?: string | undefined;
}): PermissionChangeAuditEntry[] {
  let entries = [...permissionAuditRegistry];

  if (filter?.targetUserId) {
    entries = entries.filter((e) => e.targetUserId === filter.targetUserId);
  }

  if (filter?.actorId) {
    entries = entries.filter((e) => e.actorId === filter.actorId);
  }

  return entries;
}

/**
 * Clears recorded permission change audit entries (for test resets).
 */
export function clearPermissionChangeAuditEntries(): void {
  permissionAuditRegistry.length = 0;
}

/**
 * Seeds permission change audit entries for initial view or testing.
 */
export function seedPermissionChangeAuditEntries(entries: PermissionChangeAuditEntry[]): void {
  permissionAuditRegistry.push(...entries);
}
