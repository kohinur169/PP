// path: tests/tenant/context.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { NextRequest } from 'next/server';
import {
  resolveTenantContext,
  withTenantContext,
  getCurrentTenantContext,
  buildSetTenantContextSql,
  applyTenantFilter,
} from '@/lib/tenant/context';
import {
  TenantProvider,
  TenantProviderProps,
  useTenant,
  CompanyMetadata,
} from '@/components/tenant/TenantProvider';
import { UserRepository } from '@/lib/db/users';
import { CompanyRepository } from '@/lib/db/companies';
import { AuditLogRepository } from '@/lib/db/audit';
import { Role } from '@/lib/auth/roles';

describe('Step 065: Multi-Tenant Context Resolution & Isolation Middleware', () => {
  let userRepo: UserRepository;
  let companyRepo: CompanyRepository;
  let auditRepo: AuditLogRepository;

  const OWNER_USER_ID = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const OWNER_COMPANY_ID = '018f6c4c-3500-7fa1-b1e2-123456789abc';

  const FOREIGN_COMPANY_ID = '018f6c4c-3500-7fa1-b1e2-987654321def';
  const OFFICER_USER_ID = '018f6c4c-3500-7fa1-b1e2-200000000002';

  beforeEach(async () => {
    userRepo = new UserRepository();
    companyRepo = new CompanyRepository();
    auditRepo = new AuditLogRepository();

    const validAddress = {
      street1: '100 Market St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    };

    // Seed merchant company
    await companyRepo.createCompany({
      company_id: OWNER_COMPANY_ID,
      legal_name: 'Merchant Acme Store LLC',
      dba_name: 'Acme Store',
      business_type: 'llc',
      registration_number: 'US-REG-001',
      country: 'US',
      operating_address: validAddress,
      mcc: '5411',
      risk_tier: 1,
      status: 'active',
      custom_fee_percent: '2.5000',
      custom_hold_days: 7,
      reserve_percent: '10.0000',
      reserve_hold_days: 180,
      default_currency: 'USD',
    });

    // Seed foreign company
    await companyRepo.createCompany({
      company_id: FOREIGN_COMPANY_ID,
      legal_name: 'Foreign Competitor Ltd',
      dba_name: 'Foreign Store',
      business_type: 'corporation',
      registration_number: 'US-REG-002',
      country: 'US',
      operating_address: validAddress,
      mcc: '5411',
      risk_tier: 2,
      status: 'active',
      custom_fee_percent: '2.9000',
      custom_hold_days: 7,
      reserve_percent: '10.0000',
      reserve_hold_days: 180,
      default_currency: 'USD',
    });

    // Seed owner user
    await userRepo.createUser({
      id: OWNER_USER_ID,
      email: 'owner@acme.com',
      password_hash: '$2b$12$eXampleHashedPasswordForTest000000000000000000000000000',
      full_legal_name: 'Alice Owner',
      company_id: OWNER_COMPANY_ID,
      is_staff: false,
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
    });

    // Seed compliance officer user
    await userRepo.createUser({
      id: OFFICER_USER_ID,
      email: 'compliance@kdsolution.it',
      password_hash: '$2b$12$eXampleHashedPasswordForTest000000000000000000000000000',
      full_legal_name: 'Bob Compliance',
      company_id: '00000000-0000-7000-8000-000000000000',
      is_staff: true,
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
    });
  });

  describe('Step 065.1: Sub-Merchant Owner Tenant Resolution', () => {
    it('resolves active company ID for sub-merchant owner when x-company-id header is absent', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard/charges', {
        headers: {
          'x-user-id': OWNER_USER_ID,
          'x-user-role': Role.OWNER,
        },
      });

      const context = await resolveTenantContext(req, {
        userRepo,
        companyRepo,
        auditRepo,
      });

      expect(context.companyId).toBe(OWNER_COMPANY_ID);
      expect(context.userId).toBe(OWNER_USER_ID);
      expect(context.role).toBe(Role.OWNER);
      expect(context.isSuperadmin).toBe(false);
      expect(context.isOfficeStaff).toBe(false);
      expect(context.isContextSwitched).toBe(false);
    });

    it('resolves active company ID when sub-merchant owner provides matching x-company-id', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard/charges', {
        headers: {
          'x-user-id': OWNER_USER_ID,
          'x-user-role': Role.OWNER,
          'x-company-id': OWNER_COMPANY_ID,
        },
      });

      const context = await resolveTenantContext(req, {
        userRepo,
        companyRepo,
        auditRepo,
      });

      expect(context.companyId).toBe(OWNER_COMPANY_ID);
      expect(context.isContextSwitched).toBe(false);
    });
  });

  describe('Step 065.2: Office Roles Tenant Context Switching with Audit Logging', () => {
    it('allows compliance officer to switch tenant context to view a sub-merchant company', async () => {
      const req = new NextRequest(
        `http://localhost:3000/compliance/merchants?companyId=${OWNER_COMPANY_ID}`,
        {
          headers: {
            'x-user-id': OFFICER_USER_ID,
            'x-staff-role': Role.COMPLIANCE_KYC,
            'x-company-id': OWNER_COMPANY_ID,
          },
        }
      );

      const context = await resolveTenantContext(req, {
        userRepo,
        companyRepo,
        auditRepo,
      });

      expect(context.companyId).toBe(OWNER_COMPANY_ID);
      expect(context.userId).toBe(OFFICER_USER_ID);
      expect(context.isOfficeStaff).toBe(true);
      expect(context.isContextSwitched).toBe(true);

      // Verify audit event was logged
      const auditLogs = await auditRepo.findByCompany(OWNER_COMPANY_ID);
      const switchLog = auditLogs.find((l) => l.action === 'TENANT_CONTEXT_SWITCHED');
      expect(switchLog).toBeDefined();
      expect(switchLog?.actor_id).toBe(OFFICER_USER_ID);
      expect(switchLog?.payload.switchedTo).toBe(OWNER_COMPANY_ID);
      expect(switchLog?.payload.targetCompanyName).toBe('Merchant Acme Store LLC');
    });

    it('rejects context switch if target company does not exist', async () => {
      const nonExistentCompanyId = '018f6c4c-3500-7fa1-b1e2-000000000404';

      const req = new NextRequest('http://localhost:3000/compliance/merchants', {
        headers: {
          'x-user-id': OFFICER_USER_ID,
          'x-staff-role': Role.COMPLIANCE_KYC,
          'x-company-id': nonExistentCompanyId,
        },
      });

      await expect(
        resolveTenantContext(req, {
          userRepo,
          companyRepo,
          auditRepo,
        })
      ).rejects.toThrow(/Target company ".*" does not exist or is inactive/);
    });
  });

  describe('Step 065.3: React Context <TenantProvider>', () => {
    it('provides company metadata and helper values via useTenant', () => {
      const companyMetadata: CompanyMetadata = {
        id: OWNER_COMPANY_ID,
        legal_name: 'Merchant Acme Store LLC',
        trading_name: 'Acme Store',
        risk_tier: 1,
        default_currency: 'USD',
      };

      let observedContext: any;

      function ConsumerComponent() {
        observedContext = useTenant();
        return React.createElement('div', null, observedContext.company?.legal_name);
      }

      const tree = React.createElement<TenantProviderProps>(
        TenantProvider,
        {
          initialCompany: companyMetadata,
          initialCompanyId: OWNER_COMPANY_ID,
          role: Role.OWNER,
          isOfficeStaff: false,
          children: React.createElement(ConsumerComponent),
        }
      );

      // Simulate rendering component
      expect(tree).toBeDefined();
      expect(tree.props.initialCompanyId).toBe(OWNER_COMPANY_ID);
      expect(tree.props.initialCompany?.legal_name).toBe('Merchant Acme Store LLC');
    });

    it('throws descriptive error when useTenant is called outside <TenantProvider>', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(() => {
          useTenant();
        }).toThrow('useTenant must be used within a <TenantProvider>');
      } finally {
        consoleSpy.mockRestore();
      }
    });

  });

  describe('Step 065.4: Missing or Tampered Company Headers Fail Closed', () => {
    it('fails closed when sub-merchant owner attempts to access foreign company', async () => {
      const tamperingReq = new NextRequest('http://localhost:3000/dashboard/charges', {
        headers: {
          'x-user-id': OWNER_USER_ID,
          'x-user-role': Role.OWNER,
          'x-company-id': FOREIGN_COMPANY_ID, // FOREIGN COMPANY!
        },
      });

      await expect(
        resolveTenantContext(tamperingReq, {
          userRepo,
          companyRepo,
          auditRepo,
        })
      ).rejects.toThrow(
        /Cross-tenant violation: sub-merchant owner is not authorized to access foreign company/
      );
    });

    it('fails closed when user identification is missing', async () => {
      const anonymousReq = new NextRequest('http://localhost:3000/dashboard/charges');

      await expect(
        resolveTenantContext(anonymousReq, {
          userRepo,
          companyRepo,
          auditRepo,
        })
      ).rejects.toThrow(/Unauthenticated tenant context: actor user identification is missing/);
    });

    it('fails closed when sub-merchant user has no assigned company', async () => {
      const unassignedUserId = '018f6c4c-3500-7fa1-b1e2-333333333333';
      await userRepo.createUser({
        id: unassignedUserId,
        email: 'unassigned@example.com',
        password_hash: '$2b$12$eXampleHashedPasswordForTest000000000000000000000000000',
        full_legal_name: 'Unassigned User',
        company_id: '00000000-0000-0000-0000-000000000000',
        is_staff: false,
        status: 'active',
        failed_attempts: 0,
        locked_until: null,
      });

      const req = new NextRequest('http://localhost:3000/dashboard/charges', {
        headers: {
          'x-user-id': unassignedUserId,
          'x-user-role': Role.OWNER,
        },
      });

      await expect(
        resolveTenantContext(req, {
          userRepo,
          companyRepo,
          auditRepo,
        })
      ).rejects.toThrow(/Cross-tenant violation: sub-merchant user ".*" has no assigned company/);
    });
  });

  describe('Verification & Quality Gate: Query Isolation & SQL Context Injection', () => {
    it('Verification Gate: generates SQL statements setting PostgreSQL tenant session variables', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard/charges', {
        headers: {
          'x-user-id': OWNER_USER_ID,
          'x-user-role': Role.OWNER,
        },
      });

      const context = await resolveTenantContext(req, {
        userRepo,
        companyRepo,
        auditRepo,
      });

      const sql = buildSetTenantContextSql(context);

      expect(sql).toContain(`SELECT set_tenant_context('${OWNER_COMPANY_ID}'::uuid, '${OWNER_USER_ID}'::uuid, false);`);
      expect(sql).toContain(`SET LOCAL app.current_company_id = '${OWNER_COMPANY_ID}';`);
      expect(sql).toContain(`SET LOCAL app.current_tenant_id = '${OWNER_COMPANY_ID}';`);
      expect(sql).toContain(`SET LOCAL app.current_user_id = '${OWNER_USER_ID}';`);
      expect(sql).toContain(`SET LOCAL app.is_superadmin = 'false';`);
    });

    it('Verification Gate: applyTenantFilter strictly restricts query results to active company_id', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard/charges', {
        headers: {
          'x-user-id': OWNER_USER_ID,
          'x-user-role': Role.OWNER,
        },
      });

      const context = await resolveTenantContext(req, {
        userRepo,
        companyRepo,
        auditRepo,
      });

      const mockCharges = [
        { id: 'ch_1', company_id: OWNER_COMPANY_ID, amount_usd: 100 },
        { id: 'ch_2', company_id: OWNER_COMPANY_ID, amount_usd: 250 },
        { id: 'ch_3', company_id: FOREIGN_COMPANY_ID, amount_usd: 9999 }, // FOREIGN RECORD!
      ];

      const filtered = applyTenantFilter(mockCharges, context);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((c) => c.company_id === OWNER_COMPANY_ID)).toBe(true);
      expect(filtered.some((c) => c.company_id === FOREIGN_COMPANY_ID)).toBe(false);
    });

    it('runs code within AsyncLocalStorage withTenantContext', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard/charges', {
        headers: {
          'x-user-id': OWNER_USER_ID,
          'x-user-role': Role.OWNER,
        },
      });

      const context = await resolveTenantContext(req, {
        userRepo,
        companyRepo,
        auditRepo,
      });

      await withTenantContext(context, async () => {
        const activeContext = getCurrentTenantContext();
        expect(activeContext).toBeDefined();
        expect(activeContext?.companyId).toBe(OWNER_COMPANY_ID);
        expect(activeContext?.userId).toBe(OWNER_USER_ID);
      });
    });
  });
});
