// path: tests/auth/rbac.test.ts
import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  assertPermission,
  requirePermission,
} from '@/lib/auth';

describe('Role-Based Access Control RBAC & Permission Matrix (Step 016)', () => {
  describe('Role-Permission Boundary Enforcement', () => {
    it('should grant full platform permissions to owner role', () => {
      expect(hasPermission('owner', 'charges:create')).toBe(true);
      expect(hasPermission('owner', 'refunds:approve')).toBe(true);
      expect(hasPermission('owner', 'payouts:freeze')).toBe(true);
      expect(hasPermission('owner', 'bank_accounts:write')).toBe(true);
      expect(hasPermission('owner', 'team:manage')).toBe(true);
      expect(hasPermission('owner', 'api_keys:write')).toBe(true);
      expect(hasPermission('owner', 'risk:configure')).toBe(true);
    });

    it('should grant read-only permissions to merchant_viewer and deny all write actions', () => {
      // Allowed read actions
      expect(hasPermission('merchant_viewer', 'charges:read')).toBe(true);
      expect(hasPermission('merchant_viewer', 'payouts:read')).toBe(true);
      expect(hasPermission('merchant_viewer', 'invoices:read')).toBe(true);

      // Denied write/management actions
      expect(hasPermission('merchant_viewer', 'charges:create')).toBe(false);
      expect(hasPermission('merchant_viewer', 'refunds:create')).toBe(false);
      expect(hasPermission('merchant_viewer', 'bank_accounts:write')).toBe(false);
      expect(hasPermission('merchant_viewer', 'api_keys:write')).toBe(false);
      expect(hasPermission('merchant_viewer', 'team:manage')).toBe(false);
    });

    it('should allow compliance_officer to review KYC and freeze payouts, but forbid API keys and team management', () => {
      // Compliance powers
      expect(hasPermission('compliance_officer', 'kyc:review')).toBe(true);
      expect(hasPermission('compliance_officer', 'kyc:approve')).toBe(true);
      expect(hasPermission('compliance_officer', 'risk:configure')).toBe(true);
      expect(hasPermission('compliance_officer', 'payouts:freeze')).toBe(true);

      // Forbidden technical & admin powers
      expect(hasPermission('compliance_officer', 'api_keys:write')).toBe(false);
      expect(hasPermission('compliance_officer', 'webhooks:write')).toBe(false);
      expect(hasPermission('compliance_officer', 'team:manage')).toBe(false);
    });

    it('should allow developer to manage API keys and webhooks, but forbid KYC approval and bank account updates', () => {
      // Developer powers
      expect(hasPermission('developer', 'api_keys:write')).toBe(true);
      expect(hasPermission('developer', 'webhooks:write')).toBe(true);
      expect(hasPermission('developer', 'gateways:configure')).toBe(true);

      // Forbidden compliance & financial powers
      expect(hasPermission('developer', 'kyc:approve')).toBe(false);
      expect(hasPermission('developer', 'bank_accounts:write')).toBe(false);
      expect(hasPermission('developer', 'payouts:freeze')).toBe(false);
    });
  });

  describe('Multi-Permission Evaluation Helpers', () => {
    it('should correctly evaluate hasAllPermissions', () => {
      expect(
        hasAllPermissions('admin', ['charges:read', 'refunds:create', 'api_keys:write'])
      ).toBe(true);

      expect(
        hasAllPermissions('admin', ['charges:read', 'team:manage']) // team:manage is owner-only
      ).toBe(false);
    });

    it('should correctly evaluate hasAnyPermission', () => {
      expect(
        hasAnyPermission('merchant_viewer', ['team:manage', 'charges:read'])
      ).toBe(true);

      expect(
        hasAnyPermission('merchant_viewer', ['team:manage', 'bank_accounts:write'])
      ).toBe(false);
    });
  });

  describe('Permission Assertions & Superadmin Override', () => {
    it('should not throw when asserting granted permissions', () => {
      expect(() => assertPermission('admin', 'charges:create')).not.toThrow();
    });

    it('should throw an Access Denied error when asserting unauthorized permissions', () => {
      expect(() => assertPermission('merchant_viewer', 'bank_accounts:write')).toThrowError(
        /Access Denied: Role "merchant_viewer" lacks required permission "bank_accounts:write"/
      );
    });

    it('should bypass all permission restrictions when isSuperadmin is true', () => {
      expect(hasPermission('merchant_viewer', 'bank_accounts:write', true)).toBe(true);
      expect(hasPermission('developer', 'kyc:approve', true)).toBe(true);
      expect(() => assertPermission('merchant_viewer', 'team:manage', true)).not.toThrow();
    });
  });

  describe('requirePermission Middleware Guard', () => {
    it('should return RFC 7807 403 Forbidden Response when role is unauthorized', async () => {
      const result = await requirePermission(
        'merchant_viewer',
        'bank_accounts:write',
        async () => {
          return { updated: true };
        },
        { path: '/api/bank-accounts' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(403);
        const json = await result.response.json();
        expect(json.status).toBe(403);
        expect(json.type).toBe('https://kdsolution.it/errors/forbidden');
        expect(json.detail).toContain('bank_accounts:write');
      }
    });

    it('should execute protected handler when role possesses required permission', async () => {
      const result = await requirePermission(
        'owner',
        'bank_accounts:write',
        async () => {
          return { bankUpdated: true, iban: 'SG1234567890' };
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bankUpdated).toBe(true);
        expect(result.data.iban).toBe('SG1234567890');
      }
    });
  });
});
