// path: lib/auth/roles.ts

import {
  Role,
  PlatformRole,
  PLATFORM_ROLES,
  Permission,
  SystemPermission,
  ALL_PERMISSIONS,
  RoleSchema,
  PermissionSchema,
} from '@/types/permissions';
import { logger } from '@/lib/logger';

export {
  Role,
  PLATFORM_ROLES,
  Permission,
  ALL_PERMISSIONS,
  RoleSchema,
  PermissionSchema,
};

export type { PlatformRole, SystemPermission };


/**
 * Standard Static Permission Mapping Matrix for KD SOLUTION IT PayFac.
 * Maps all 8 platform roles to their allowed granular permission sets.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Super Admin: Full platform authority, sets settings, delegates office permissions
  [Role.SUPER_ADMIN]: ALL_PERMISSIONS,

  // CEO: Executive oversight, approvals, final KYC approval, pricing and country decisions
  [Role.CEO]: [
    Permission.VIEW_GATEWAYS,
    Permission.VIEW_KYC,
    Permission.APPROVE_KYC,
    Permission.VIEW_PRICING,
    Permission.MANAGE_PRICING,
    Permission.APPROVE_PRICING_CHANGE,
    Permission.ENABLE_DISABLE_COUNTRY,
    Permission.VIEW_PAYOUTS,
    Permission.RELEASE_PAYOUT,
    Permission.APPROVE_LARGE_PAYOUT,
    Permission.VIEW_LEDGER,
    Permission.VIEW_CHARGES,
    Permission.VIEW_REFUNDS,
    Permission.VIEW_DISPUTES,
    Permission.VIEW_TICKETS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.EXPORT_AUDIT_LOGS,
  ],

  // Compliance KYC: KYC/KYB reviews, underwriting criteria, manual payment reviews, SAR cases, PEP/sanctions
  [Role.COMPLIANCE_KYC]: [
    Permission.VIEW_KYC,
    Permission.REVIEW_KYC,
    Permission.APPROVE_KYC,
    Permission.PREPARE_SAR,
    Permission.VIEW_SAR,
    Permission.SANCTIONS_PEP_SCREEN,
    Permission.UNDERWRITING_CONFIG,
    Permission.MANUAL_PAYMENT_REVIEW,
    Permission.REVIEW_DISPUTE_DOCS,
    Permission.VIEW_CHARGES,
    Permission.VIEW_REFUNDS,
    Permission.VIEW_DISPUTES,
    Permission.VIEW_PAYOUTS,
    Permission.FREEZE_PAYOUT,
    Permission.UNLOCK_ACCOUNTS,
    Permission.RESET_OFFICE_2FA,
    Permission.VIEW_AUDIT_LOGS,
    Permission.EXPORT_AUDIT_LOGS,
  ],

  // Finance Ops: Reconciliation mismatch resolution, failed payout handling, settlement release, processor bill matching
  [Role.FINANCE_OPS]: [
    Permission.VIEW_LEDGER,
    Permission.MANAGE_RECONCILIATION,
    Permission.RESOLVE_RECONCILIATION_MISMATCH,
    Permission.MATCH_PROCESSOR_BILLS,
    Permission.VIEW_PAYOUTS,
    Permission.RELEASE_PAYOUT,
    Permission.HANDLE_FAILED_PAYOUTS,
    Permission.VIEW_CHARGES,
    Permission.VIEW_REFUNDS,
    Permission.APPROVE_REFUNDS,
    Permission.VIEW_DISPUTES,
    Permission.VIEW_AUDIT_LOGS,
  ],

  // Support: Support tickets, merchant help, read-only invoice and transaction view. Zero gateway key or KYC approval.
  [Role.SUPPORT]: [
    Permission.VIEW_TICKETS,
    Permission.CREATE_TICKETS,
    Permission.ASSIGN_TICKETS,
    Permission.RESOLVE_TICKETS,
    Permission.HELP_MERCHANT,
    Permission.VIEW_CHARGES,
    Permission.VIEW_REFUNDS,
    Permission.VIEW_DISPUTES,
    Permission.VIEW_INVOICES,
  ],

  // Blogger: Public content, CMS, blog posts only. Zero merchant, payment, KYC, or platform access.
  [Role.BLOGGER]: [
    Permission.VIEW_BLOG,
    Permission.CREATE_BLOG_POSTS,
    Permission.EDIT_BLOG_POSTS,
    Permission.PUBLISH_BLOG_POSTS,
    Permission.MANAGE_CMS,
  ],

  // Owner (Sub-merchant): Complete tenant/company management, payments, refunds, disputes, bank accounts, API keys
  [Role.OWNER]: [
    Permission.VIEW_MERCHANT_DASHBOARD,
    Permission.MANAGE_MERCHANT_SETTINGS,
    Permission.VIEW_CHARGES,
    Permission.CREATE_CHARGES,
    Permission.CAPTURE_CHARGES,
    Permission.VIEW_REFUNDS,
    Permission.CREATE_REFUNDS,
    Permission.VIEW_DISPUTES,
    Permission.RESPOND_DISPUTES,
    Permission.ACCEPT_DISPUTES,
    Permission.VIEW_PAYOUTS,
    Permission.INITIATE_PAYOUT,
    Permission.VIEW_BANK_ACCOUNTS,
    Permission.MANAGE_BANK_ACCOUNTS,
    Permission.MANAGE_API_KEYS,
    Permission.MANAGE_WEBHOOKS,
    Permission.INVITE_TEAM,
    Permission.MANAGE_TEAM,
    Permission.VIEW_INVOICES,
    Permission.MANAGE_INVOICES,
    Permission.CREATE_TICKETS,
    Permission.VIEW_TICKETS,
  ],

  // Client (Token-only): Checkout payment token execution and payment session status view only
  [Role.CLIENT]: [
    Permission.TOKEN_CHECKOUT,
    Permission.VIEW_PAYMENT_SESSION,
  ],
};

/**
 * Pre-compiled O(1) Sets for fast role permission evaluation.
 */
const ROLE_PERMISSION_SETS = new Map<Role, Set<Permission>>();

for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
  ROLE_PERMISSION_SETS.set(role as Role, new Set(permissions));
}

/**
 * Designated dashboard home route prefix for each system role.
 */
export const ROLE_DASHBOARD_ROUTES: Record<Role, string> = {
  [Role.SUPER_ADMIN]: '/super-admin',
  [Role.CEO]: '/ceo',
  [Role.COMPLIANCE_KYC]: '/compliance',
  [Role.FINANCE_OPS]: '/finance',
  [Role.SUPPORT]: '/support',
  [Role.BLOGGER]: '/blogger',
  [Role.OWNER]: '/dashboard',
  [Role.CLIENT]: '/checkout',
};

/**
 * Permissions classified as merchant-level financial, payment, customer, or account data.
 */
export const MERCHANT_ACCESS_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.VIEW_MERCHANT_DASHBOARD,
  Permission.MANAGE_MERCHANT_SETTINGS,
  Permission.VIEW_CHARGES,
  Permission.CREATE_CHARGES,
  Permission.CAPTURE_CHARGES,
  Permission.MANUAL_PAYMENT_REVIEW,
  Permission.VIEW_REFUNDS,
  Permission.CREATE_REFUNDS,
  Permission.APPROVE_REFUNDS,
  Permission.VIEW_DISPUTES,
  Permission.RESPOND_DISPUTES,
  Permission.ACCEPT_DISPUTES,
  Permission.REVIEW_DISPUTE_DOCS,
  Permission.VIEW_PAYOUTS,
  Permission.INITIATE_PAYOUT,
  Permission.RELEASE_PAYOUT,
  Permission.APPROVE_LARGE_PAYOUT,
  Permission.FREEZE_PAYOUT,
  Permission.HANDLE_FAILED_PAYOUTS,
  Permission.VIEW_BANK_ACCOUNTS,
  Permission.MANAGE_BANK_ACCOUNTS,
  Permission.MANAGE_API_KEYS,
  Permission.MANAGE_WEBHOOKS,
  Permission.INVITE_TEAM,
  Permission.MANAGE_TEAM,
  Permission.VIEW_INVOICES,
  Permission.MANAGE_INVOICES,
  Permission.VIEW_KYC,
  Permission.REVIEW_KYC,
  Permission.APPROVE_KYC,
  Permission.PREPARE_SAR,
  Permission.VIEW_SAR,
  Permission.SANCTIONS_PEP_SCREEN,
  Permission.UNDERWRITING_CONFIG,
  Permission.VIEW_LEDGER,
  Permission.MANAGE_RECONCILIATION,
  Permission.RESOLVE_RECONCILIATION_MISMATCH,
  Permission.MATCH_PROCESSOR_BILLS,
  Permission.MANAGE_GATEWAYS,
  Permission.VIEW_GATEWAYS,
  Permission.ROTATE_GATEWAY_KEYS,
  Permission.MANAGE_PRICING,
  Permission.VIEW_PRICING,
  Permission.APPROVE_PRICING_CHANGE,
  Permission.ENABLE_DISABLE_COUNTRY,
  Permission.VIEW_TICKETS,
  Permission.CREATE_TICKETS,
  Permission.ASSIGN_TICKETS,
  Permission.RESOLVE_TICKETS,
  Permission.HELP_MERCHANT,
  Permission.VIEW_AUDIT_LOGS,
  Permission.EXPORT_AUDIT_LOGS,
  Permission.MANAGE_PLATFORM_SETTINGS,
  Permission.DELEGATE_PERMISSIONS,
  Permission.UNLOCK_ACCOUNTS,
  Permission.RESET_OFFICE_2FA,
]);

/**
 * Set of office staff roles.
 */
export const OFFICE_ROLES: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.CEO,
  Role.COMPLIANCE_KYC,
  Role.FINANCE_OPS,
  Role.SUPPORT,
  Role.BLOGGER,
]);

/**
 * Checks whether a given role has a specific system permission.
 * Super admin role automatically possesses all permissions.
 *
 * @param role The platform role being evaluated.
 * @param permission The granular permission requested.
 * @returns boolean true if authorized, false otherwise.
 */
export function hasPermission(
  role: Role | PlatformRole | string,
  permission: Permission | SystemPermission | string
): boolean {
  if (role === Role.SUPER_ADMIN || role === 'super_admin') {
    return true;
  }

  const set = ROLE_PERMISSION_SETS.get(role as Role);
  if (!set) {
    return false;
  }

  return set.has(permission as Permission);
}

/**
 * Evaluates whether a role possesses ALL of the specified permissions.
 */
export function hasAllPermissions(
  role: Role | PlatformRole | string,
  permissions: (Permission | SystemPermission | string)[]
): boolean {
  if (role === Role.SUPER_ADMIN || role === 'super_admin') {
    return true;
  }
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Evaluates whether a role possesses AT LEAST ONE of the specified permissions.
 */
export function hasAnyPermission(
  role: Role | PlatformRole | string,
  permissions: (Permission | SystemPermission | string)[]
): boolean {
  if (role === Role.SUPER_ADMIN || role === 'super_admin') {
    return true;
  }
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Asserts that a role possesses a required permission, throwing an Error if denied.
 */
export function assertPermission(
  role: Role | PlatformRole | string,
  permission: Permission | SystemPermission | string
): void {
  if (!hasPermission(role, permission)) {
    const errorMsg = `Access Denied: Role "${role}" lacks required permission "${permission}".`;
    logger.warn('Role permission check failed', { role, permission });
    throw new Error(errorMsg);
  }
}

/**
 * Returns all permissions granted to a given role.
 */
export function getRolePermissions(role: Role | PlatformRole | string): Permission[] {
  if (role === Role.SUPER_ADMIN || role === 'super_admin') {
    return [...ALL_PERMISSIONS];
  }
  const set = ROLE_PERMISSION_SETS.get(role as Role);
  return set ? Array.from(set) : [];
}

/**
 * Checks if a role is an internal office staff role.
 */
export function isOfficeRole(role: Role | PlatformRole | string): boolean {
  return OFFICE_ROLES.has(role as Role);
}

/**
 * Checks if a role is a merchant owner role.
 */
export function isMerchantRole(role: Role | PlatformRole | string): boolean {
  return role === Role.OWNER || role === 'owner';
}

/**
 * Checks if a role is a client token-only role.
 */
export function isClientRole(role: Role | PlatformRole | string): boolean {
  return role === Role.CLIENT || role === 'client';
}

/**
 * Evaluates whether a role possesses ANY merchant-level access permission.
 * Specifically used to validate that the blogger role and client role have zero merchant access.
 */
export function hasMerchantAccess(role: Role | PlatformRole | string): boolean {
  const permissions = getRolePermissions(role);
  return permissions.some((p) => MERCHANT_ACCESS_PERMISSIONS.has(p));
}

/**
 * Retrieves the designated dashboard URL path for a given role.
 */
export function getDashboardRouteForRole(role: Role | PlatformRole | string): string {
  return ROLE_DASHBOARD_ROUTES[role as Role] ?? '/dashboard';
}

/**
 * Type guard checking if an arbitrary value is a recognized platform Role.
 */
export function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && PLATFORM_ROLES.includes(value as PlatformRole);
}

/**
 * Type guard checking if an arbitrary value is a recognized Permission.
 */
export function isValidPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (ALL_PERMISSIONS as readonly string[]).includes(value);
}
