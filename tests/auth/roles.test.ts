// path: tests/auth/roles.test.ts

import { describe, it, expect } from 'vitest';
import {
  Role,
  PlatformRole,
  PLATFORM_ROLES,
  Permission,
  ALL_PERMISSIONS,
  RoleSchema,
  PermissionSchema,
  ROLE_PERMISSIONS,
  ROLE_DASHBOARD_ROUTES,
  MERCHANT_ACCESS_PERMISSIONS,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  assertPermission,
  getRolePermissions,
  isOfficeRole,
  isMerchantRole,
  isClientRole,
  hasMerchantAccess,
  getDashboardRouteForRole,
  isValidRole,
  isValidPermission,
} from '@/lib/auth/roles';

describe('Step 061: RBAC Permission Matrix & System Role Definitions', () => {
  describe('Step 061.1: Role Enum & Platform Roles', () => {
    it('defines exactly the 8 specified platform roles in Role enum', () => {
      expect(Role.SUPER_ADMIN).toBe('super_admin');
      expect(Role.CEO).toBe('ceo');
      expect(Role.COMPLIANCE_KYC).toBe('compliance_kyc');
      expect(Role.FINANCE_OPS).toBe('finance_ops');
      expect(Role.SUPPORT).toBe('support');
      expect(Role.BLOGGER).toBe('blogger');
      expect(Role.OWNER).toBe('owner');
      expect(Role.CLIENT).toBe('client');

      const enumValues = Object.values(Role);
      expect(enumValues).toHaveLength(8);
      expect(PLATFORM_ROLES).toHaveLength(8);
    });

    it('validates roles using RoleSchema Zod parser', () => {
      for (const role of PLATFORM_ROLES) {
        expect(RoleSchema.parse(role)).toBe(role);
      }
      expect(() => RoleSchema.parse('invalid_role')).toThrow();
      expect(() => RoleSchema.parse('admin')).toThrow(); // tenant admin is not platform role
    });

    it('provides type guards for roles', () => {
      expect(isValidRole('super_admin')).toBe(true);
      expect(isValidRole('ceo')).toBe(true);
      expect(isValidRole('compliance_kyc')).toBe(true);
      expect(isValidRole('finance_ops')).toBe(true);
      expect(isValidRole('support')).toBe(true);
      expect(isValidRole('blogger')).toBe(true);
      expect(isValidRole('owner')).toBe(true);
      expect(isValidRole('client')).toBe(true);
      expect(isValidRole('unknown_role')).toBe(false);
      expect(isValidRole(123)).toBe(false);
    });
  });

  describe('Step 061.2: Granular System Permissions', () => {
    it('defines key granular permissions across domains', () => {
      expect(Permission.MANAGE_GATEWAYS).toBe('MANAGE_GATEWAYS');
      expect(Permission.APPROVE_KYC).toBe('APPROVE_KYC');
      expect(Permission.MANAGE_PRICING).toBe('MANAGE_PRICING');
      expect(Permission.VIEW_LEDGER).toBe('VIEW_LEDGER');
      expect(Permission.RESOLVE_TICKETS).toBe('RESOLVE_TICKETS');
      expect(Permission.PREPARE_SAR).toBe('PREPARE_SAR');
      expect(Permission.RESOLVE_RECONCILIATION_MISMATCH).toBe('RESOLVE_RECONCILIATION_MISMATCH');
      expect(Permission.TOKEN_CHECKOUT).toBe('TOKEN_CHECKOUT');
    });

    it('contains no duplicate permissions in ALL_PERMISSIONS catalog', () => {
      const unique = new Set(ALL_PERMISSIONS);
      expect(unique.size).toBe(ALL_PERMISSIONS.length);
      expect(ALL_PERMISSIONS.length).toBeGreaterThanOrEqual(40);
    });

    it('validates permissions using PermissionSchema', () => {
      expect(PermissionSchema.parse('MANAGE_GATEWAYS')).toBe(Permission.MANAGE_GATEWAYS);
      expect(PermissionSchema.parse('APPROVE_KYC')).toBe(Permission.APPROVE_KYC);
      expect(() => PermissionSchema.parse('INVALID_PERMISSION')).toThrow();
    });

    it('provides type guard isValidPermission', () => {
      expect(isValidPermission('MANAGE_GATEWAYS')).toBe(true);
      expect(isValidPermission('APPROVE_KYC')).toBe(true);
      expect(isValidPermission('NOT_A_PERM')).toBe(false);
      expect(isValidPermission(null)).toBe(false);
    });
  });

  describe('Step 061.3: Static Permission Mapping Table', () => {
    it('maps every platform role in ROLE_PERMISSIONS', () => {
      for (const role of PLATFORM_ROLES) {
        expect(ROLE_PERMISSIONS[role as Role]).toBeDefined();
        expect(Array.isArray(ROLE_PERMISSIONS[role as Role])).toBe(true);
      }
    });

    it('contains only valid permissions in mapping arrays', () => {
      for (const role of PLATFORM_ROLES) {
        const perms = ROLE_PERMISSIONS[role as Role];
        for (const perm of perms) {
          expect(isValidPermission(perm)).toBe(true);
        }
      }
    });
  });

  describe('Step 061.4: hasPermission Utility Function', () => {
    it('evaluates permissions for super_admin as all-inclusive', () => {
      for (const perm of ALL_PERMISSIONS) {
        expect(hasPermission(Role.SUPER_ADMIN, perm)).toBe(true);
        expect(hasPermission('super_admin', perm)).toBe(true);
      }
    });

    it('evaluates permissions for ceo correctly', () => {
      expect(hasPermission(Role.CEO, Permission.APPROVE_KYC)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.MANAGE_PRICING)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.APPROVE_PRICING_CHANGE)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.ENABLE_DISABLE_COUNTRY)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.APPROVE_LARGE_PAYOUT)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.RELEASE_PAYOUT)).toBe(true);
      expect(hasPermission(Role.CEO, Permission.VIEW_LEDGER)).toBe(true);

      // CEO does not manage technical gateways or write blog posts
      expect(hasPermission(Role.CEO, Permission.MANAGE_GATEWAYS)).toBe(false);
      expect(hasPermission(Role.CEO, Permission.ROTATE_GATEWAY_KEYS)).toBe(false);
      expect(hasPermission(Role.CEO, Permission.CREATE_BLOG_POSTS)).toBe(false);
      expect(hasPermission(Role.CEO, Permission.RESOLVE_TICKETS)).toBe(false);
    });

    it('evaluates permissions for compliance_kyc correctly', () => {
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.VIEW_KYC)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.REVIEW_KYC)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.APPROVE_KYC)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.PREPARE_SAR)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.VIEW_SAR)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.SANCTIONS_PEP_SCREEN)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.UNDERWRITING_CONFIG)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.MANUAL_PAYMENT_REVIEW)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.FREEZE_PAYOUT)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.UNLOCK_ACCOUNTS)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.RESET_OFFICE_2FA)).toBe(true);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.EXPORT_AUDIT_LOGS)).toBe(true);

      // Compliance cannot manage technical gateways or change pricing
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.MANAGE_GATEWAYS)).toBe(false);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.ROTATE_GATEWAY_KEYS)).toBe(false);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.MANAGE_PRICING)).toBe(false);
      expect(hasPermission(Role.COMPLIANCE_KYC, Permission.RESOLVE_TICKETS)).toBe(false);
    });

    it('evaluates permissions for finance_ops correctly', () => {
      expect(hasPermission(Role.FINANCE_OPS, Permission.VIEW_LEDGER)).toBe(true);
      expect(hasPermission(Role.FINANCE_OPS, Permission.MANAGE_RECONCILIATION)).toBe(true);
      expect(hasPermission(Role.FINANCE_OPS, Permission.RESOLVE_RECONCILIATION_MISMATCH)).toBe(true);
      expect(hasPermission(Role.FINANCE_OPS, Permission.MATCH_PROCESSOR_BILLS)).toBe(true);
      expect(hasPermission(Role.FINANCE_OPS, Permission.HANDLE_FAILED_PAYOUTS)).toBe(true);
      expect(hasPermission(Role.FINANCE_OPS, Permission.RELEASE_PAYOUT)).toBe(true);

      // Finance Ops does not approve KYC or manage gateways
      expect(hasPermission(Role.FINANCE_OPS, Permission.MANAGE_GATEWAYS)).toBe(false);
      expect(hasPermission(Role.FINANCE_OPS, Permission.APPROVE_KYC)).toBe(false);
      expect(hasPermission(Role.FINANCE_OPS, Permission.PREPARE_SAR)).toBe(false);
      expect(hasPermission(Role.FINANCE_OPS, Permission.MANAGE_PRICING)).toBe(false);
      expect(hasPermission(Role.FINANCE_OPS, Permission.RESOLVE_TICKETS)).toBe(false);
    });

    it('evaluates permissions for owner (sub-merchant) correctly', () => {
      expect(hasPermission(Role.OWNER, Permission.VIEW_MERCHANT_DASHBOARD)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_MERCHANT_SETTINGS)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.CREATE_CHARGES)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.CAPTURE_CHARGES)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.CREATE_REFUNDS)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.INITIATE_PAYOUT)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_API_KEYS)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_WEBHOOKS)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.INVITE_TEAM)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_BANK_ACCOUNTS)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.CREATE_TICKETS)).toBe(true);

      // Sub-merchant has zero office platform administration permissions
      expect(hasPermission(Role.OWNER, Permission.MANAGE_GATEWAYS)).toBe(false);
      expect(hasPermission(Role.OWNER, Permission.APPROVE_KYC)).toBe(false);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_PRICING)).toBe(false);
      expect(hasPermission(Role.OWNER, Permission.VIEW_LEDGER)).toBe(false);
      expect(hasPermission(Role.OWNER, Permission.RESOLVE_TICKETS)).toBe(false);
      expect(hasPermission(Role.OWNER, Permission.PREPARE_SAR)).toBe(false);
      expect(hasPermission(Role.OWNER, Permission.UNLOCK_ACCOUNTS)).toBe(false);
    });

    it('evaluates permissions for client (token-only) correctly', () => {
      expect(hasPermission(Role.CLIENT, Permission.TOKEN_CHECKOUT)).toBe(true);
      expect(hasPermission(Role.CLIENT, Permission.VIEW_PAYMENT_SESSION)).toBe(true);

      // Client has zero administrative or merchant data access
      expect(hasPermission(Role.CLIENT, Permission.VIEW_MERCHANT_DASHBOARD)).toBe(false);
      expect(hasPermission(Role.CLIENT, Permission.VIEW_CHARGES)).toBe(false);
      expect(hasPermission(Role.CLIENT, Permission.MANAGE_GATEWAYS)).toBe(false);
      expect(hasPermission(Role.CLIENT, Permission.APPROVE_KYC)).toBe(false);
      expect(hasPermission(Role.CLIENT, Permission.VIEW_TICKETS)).toBe(false);
    });
  });

  describe('Verification & Quality Gate', () => {
    it('Quality Gate 1: support role has zero permissions for MANAGE_GATEWAYS or APPROVE_KYC', () => {
      expect(hasPermission(Role.SUPPORT, Permission.MANAGE_GATEWAYS)).toBe(false);
      expect(hasPermission('support', 'MANAGE_GATEWAYS')).toBe(false);

      expect(hasPermission(Role.SUPPORT, Permission.APPROVE_KYC)).toBe(false);
      expect(hasPermission('support', 'APPROVE_KYC')).toBe(false);

      // Also verify support has zero for related sensitive gateway and compliance operations
      expect(hasPermission(Role.SUPPORT, Permission.ROTATE_GATEWAY_KEYS)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.VIEW_GATEWAYS)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.REVIEW_KYC)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.VIEW_KYC)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.PREPARE_SAR)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.RELEASE_PAYOUT)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.MANAGE_PRICING)).toBe(false);

      // Verify support HAS legitimate support permissions
      expect(hasPermission(Role.SUPPORT, Permission.VIEW_TICKETS)).toBe(true);
      expect(hasPermission(Role.SUPPORT, Permission.CREATE_TICKETS)).toBe(true);
      expect(hasPermission(Role.SUPPORT, Permission.ASSIGN_TICKETS)).toBe(true);
      expect(hasPermission(Role.SUPPORT, Permission.RESOLVE_TICKETS)).toBe(true);
      expect(hasPermission(Role.SUPPORT, Permission.HELP_MERCHANT)).toBe(true);
      expect(hasPermission(Role.SUPPORT, Permission.VIEW_CHARGES)).toBe(true);
      expect(hasPermission(Role.SUPPORT, Permission.VIEW_INVOICES)).toBe(true);
    });

    it('Quality Gate 2: blogger role has zero merchant access', () => {
      expect(hasMerchantAccess(Role.BLOGGER)).toBe(false);
      expect(hasMerchantAccess('blogger')).toBe(false);

      // Explicitly test every single merchant permission against blogger
      for (const perm of MERCHANT_ACCESS_PERMISSIONS) {
        expect(hasPermission(Role.BLOGGER, perm)).toBe(false);
      }

      // Verify blogger only has blog and CMS permissions
      const bloggerPerms = getRolePermissions(Role.BLOGGER);
      expect(bloggerPerms).toEqual([
        Permission.VIEW_BLOG,
        Permission.CREATE_BLOG_POSTS,
        Permission.EDIT_BLOG_POSTS,
        Permission.PUBLISH_BLOG_POSTS,
        Permission.MANAGE_CMS,
      ]);

      for (const perm of bloggerPerms) {
        expect(hasPermission(Role.BLOGGER, perm)).toBe(true);
      }
    });
  });

  describe('Compound Evaluation & Guard Utilities', () => {
    it('evaluates hasAllPermissions correctly', () => {
      expect(
        hasAllPermissions(Role.SUPPORT, [
          Permission.VIEW_TICKETS,
          Permission.RESOLVE_TICKETS,
        ])
      ).toBe(true);

      expect(
        hasAllPermissions(Role.SUPPORT, [
          Permission.VIEW_TICKETS,
          Permission.MANAGE_GATEWAYS,
        ])
      ).toBe(false);
    });

    it('evaluates hasAnyPermission correctly', () => {
      expect(
        hasAnyPermission(Role.SUPPORT, [
          Permission.MANAGE_GATEWAYS,
          Permission.RESOLVE_TICKETS,
        ])
      ).toBe(true);

      expect(
        hasAnyPermission(Role.SUPPORT, [
          Permission.MANAGE_GATEWAYS,
          Permission.APPROVE_KYC,
        ])
      ).toBe(false);
    });

    it('assertPermission permits authorized and throws on unauthorized', () => {
      expect(() => {
        assertPermission(Role.SUPPORT, Permission.RESOLVE_TICKETS);
      }).not.toThrow();

      expect(() => {
        assertPermission(Role.SUPPORT, Permission.MANAGE_GATEWAYS);
      }).toThrowError(/Access Denied: Role "support" lacks required permission "MANAGE_GATEWAYS"/);
    });

    it('correctly classifies office, merchant, and client roles', () => {
      expect(isOfficeRole(Role.SUPER_ADMIN)).toBe(true);
      expect(isOfficeRole(Role.CEO)).toBe(true);
      expect(isOfficeRole(Role.COMPLIANCE_KYC)).toBe(true);
      expect(isOfficeRole(Role.FINANCE_OPS)).toBe(true);
      expect(isOfficeRole(Role.SUPPORT)).toBe(true);
      expect(isOfficeRole(Role.BLOGGER)).toBe(true);
      expect(isOfficeRole(Role.OWNER)).toBe(false);
      expect(isOfficeRole(Role.CLIENT)).toBe(false);

      expect(isMerchantRole(Role.OWNER)).toBe(true);
      expect(isMerchantRole(Role.SUPER_ADMIN)).toBe(false);

      expect(isClientRole(Role.CLIENT)).toBe(true);
      expect(isClientRole(Role.OWNER)).toBe(false);
    });

    it('maps all 8 roles to distinct dashboard routes', () => {
      expect(getDashboardRouteForRole(Role.SUPER_ADMIN)).toBe('/super-admin');
      expect(getDashboardRouteForRole(Role.CEO)).toBe('/ceo');
      expect(getDashboardRouteForRole(Role.COMPLIANCE_KYC)).toBe('/compliance');
      expect(getDashboardRouteForRole(Role.FINANCE_OPS)).toBe('/finance');
      expect(getDashboardRouteForRole(Role.SUPPORT)).toBe('/support');
      expect(getDashboardRouteForRole(Role.BLOGGER)).toBe('/blogger');
      expect(getDashboardRouteForRole(Role.OWNER)).toBe('/dashboard');
      expect(getDashboardRouteForRole(Role.CLIENT)).toBe('/checkout');

      for (const role of PLATFORM_ROLES) {
        expect(ROLE_DASHBOARD_ROUTES[role as Role]).toBeDefined();
      }
    });
  });
});
