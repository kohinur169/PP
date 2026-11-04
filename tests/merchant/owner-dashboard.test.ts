// path: tests/merchant/owner-dashboard.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  resetMerchantDataForTest,
  seedMerchantMetricsForTest,
  seedMerchantSettingsForTest,
  getMerchantDashboardMetrics,
  getMerchantSettings,
  updateMerchantSettings,
  assertSingleOwnerCompanyAccess,
  MerchantDashboardMetrics,
  MerchantCompanySettings,
} from '@/lib/merchant/dashboard-engine';
import { AuditLogRepository } from '@/lib/db/audit';
import { GET as getDashboardMetrics } from '@/app/api/merchant/dashboard/route';
import {
  GET as getSettings,
  PUT as putSettings,
} from '@/app/api/merchant/settings/route';

describe('Step 072: Sub-Merchant Owner Dashboard Architecture & Tenant Isolation', () => {
  const companyA = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const companyB = '018f6c4c-3500-7fa1-b1e2-000000000002';
  const ownerAUserId = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const ownerBUserId = '018f6c4c-3500-7fa1-b1e2-100000000002';

  let mockAuditRepo: AuditLogRepository;
  let auditLogsRecorded: any[];

  beforeEach(() => {
    resetMerchantDataForTest();
    auditLogsRecorded = [];

    mockAuditRepo = {
      createLog: async (input: any) => {
        auditLogsRecorded.push(input);
        return {} as any;
      },
    } as unknown as AuditLogRepository;

    seedMerchantSettingsForTest({
      companyId: companyA,
      legalName: 'Acme Digital Services LLC',
      dbaName: 'Acme Cloud',
      supportEmail: 'support@acme.com',
      supportPhone: '+1-555-0100',
      statementDescriptor: 'ACME*DIGITAL',
      payoutSchedule: 'daily',
      bankAccountMasked: '****4412',
      ownerUserId: ownerAUserId,
    });

    seedMerchantSettingsForTest({
      companyId: companyB,
      legalName: 'Summit Cloud Logistics Inc',
      dbaName: 'Summit Cloud',
      supportEmail: 'support@summit.com',
      supportPhone: '+1-555-0200',
      statementDescriptor: 'SUMMIT*LOGISTICS',
      payoutSchedule: 'weekly',
      bankAccountMasked: '****9182',
      ownerUserId: ownerBUserId,
    });
  });

  describe('Step 072.3 & Step 072.4: Single-Owner Rule & Tenant Isolation', () => {
    it('allows owner to access their own company but strictly blocks cross-tenant tampering', () => {
      // Owner A accessing Company A succeeds
      expect(() =>
        assertSingleOwnerCompanyAccess(ownerAUserId, Role.OWNER, companyA, companyA)
      ).not.toThrow();

      // Owner A attempting to access Company B (session is Company A) throws Tenant Boundary Breach
      expect(() =>
        assertSingleOwnerCompanyAccess(ownerAUserId, Role.OWNER, companyB, companyA)
      ).toThrow(/Tenant boundary breach/i);

      // Owner A claiming to be owner of Company B throws single-owner rule violation
      expect(() =>
        assertSingleOwnerCompanyAccess(ownerAUserId, Role.OWNER, companyB, companyB)
      ).toThrow(/not the registered owner of company/i);
    });

    it('denies non-owner roles access to merchant owner portal', () => {
      expect(() =>
        assertSingleOwnerCompanyAccess(ownerAUserId, Role.CLIENT, companyA, companyA)
      ).toThrow(/cannot access merchant owner portal/i);

      expect(() =>
        assertSingleOwnerCompanyAccess(ownerAUserId, Role.BLOGGER, companyA, companyA)
      ).toThrow(/cannot access merchant owner portal/i);

      expect(() =>
        assertSingleOwnerCompanyAccess(ownerAUserId, Role.SUPPORT, companyA, companyA)
      ).toThrow(/cannot access merchant owner portal/i);
    });
  });

  describe('Step 072.2: Merchant Dashboard Metrics & Volume Analytics', () => {
    it('retrieves financial volume, rolling reserve, and chargeback rate metrics', async () => {
      const metrics: MerchantDashboardMetrics = {
        companyId: companyA,
        businessName: 'Acme Digital Services LLC',
        riskTier: 2,
        grossVolumeUsd: 185000,
        netSettledUsd: 179450,
        availableBalanceUsd: 32400,
        pendingSettlementUsd: 14200,
        rollingReserveUsd: 18500, // 10% for Tier 2
        activeHoldsUsd: 0,
        disputeCount: 3,
        totalTransactionsCount: 620,
        chargebackRatePercent: 0.48,
        chargebackRateBreached: false,
        recentTransactions: [
          {
            id: 'tx_01',
            amountUsd: 1200,
            status: 'succeeded',
            customerEmail: 'buyer@corp.com',
            createdAt: new Date().toISOString(),
          },
        ],
      };
      seedMerchantMetricsForTest(metrics);

      const res = await getMerchantDashboardMetrics({
        companyId: companyA,
        actorUserId: ownerAUserId,
        actorRole: Role.OWNER,
        sessionCompanyId: companyA,
      });

      expect(res.grossVolumeUsd).toBe(185000);
      expect(res.rollingReserveUsd).toBe(18500);
      expect(res.riskTier).toBe(2);
      expect(res.chargebackRateBreached).toBe(false);
      expect(res.recentTransactions).toHaveLength(1);
    });

    it('returns clean zero-state metrics for freshly onboarded sub-merchant', async () => {
      const emptyCompanyId = '018f6c4c-3500-7fa1-b1e2-000000000099';
      seedMerchantSettingsForTest({
        companyId: emptyCompanyId,
        legalName: 'New Sub-Merchant LLC',
        dbaName: 'New Sub-Merchant',
        supportEmail: 'help@new.com',
        supportPhone: '+1-555-9999',
        statementDescriptor: 'NEW*MERCHANT',
        payoutSchedule: 'daily',
        bankAccountMasked: '****0001',
        ownerUserId: 'user_new_owner_01',
      });

      const res = await getMerchantDashboardMetrics({
        companyId: emptyCompanyId,
        actorUserId: 'user_new_owner_01',
        actorRole: Role.OWNER,
        sessionCompanyId: emptyCompanyId,
      });

      expect(res.grossVolumeUsd).toBe(0);
      expect(res.availableBalanceUsd).toBe(0);
      expect(res.recentTransactions).toHaveLength(0);
    });
  });

  describe('Step 072.1: Merchant Settings & Profile Updates', () => {
    it('reads and updates company profile and audit log', async () => {
      const initial = await getMerchantSettings({
        companyId: companyA,
        actorUserId: ownerAUserId,
        actorRole: Role.OWNER,
        sessionCompanyId: companyA,
      });
      expect(initial.legalName).toBe('Acme Digital Services LLC');

      const updated = await updateMerchantSettings({
        companyId: companyA,
        dbaName: 'Acme Cloud Enterprises',
        statementDescriptor: 'ACME*ENTERPRISES',
        payoutSchedule: 'weekly',
        actorUserId: ownerAUserId,
        actorRole: Role.OWNER,
        sessionCompanyId: companyA,
        auditRepo: mockAuditRepo,
      });

      expect(updated.dbaName).toBe('Acme Cloud Enterprises');
      expect(updated.statementDescriptor).toBe('ACME*ENTERPRISES');
      expect(updated.payoutSchedule).toBe('weekly');
      expect(auditLogsRecorded).toHaveLength(1);
      expect(auditLogsRecorded[0].action).toBe('PLATFORM_SETTING_UPDATED');
    });
  });

  describe('HTTP API Endpoints Integration', () => {
    it('handles GET /api/merchant/dashboard and GET/PUT /api/merchant/settings', async () => {
      // Dashboard GET
      const dashReq = new NextRequest('http://localhost/api/merchant/dashboard', {
        headers: {
          'x-user-role': Role.OWNER,
          'x-user-id': ownerAUserId,
          'x-company-id': companyA,
          'x-session-company-id': companyA,
        },
      });
      const dashRes = await getDashboardMetrics(dashReq);
      expect(dashRes.status).toBe(200);
      const dashData = await dashRes.json();
      expect(dashData.metrics.companyId).toBe(companyA);

      // Settings GET
      const setReq = new NextRequest('http://localhost/api/merchant/settings', {
        headers: {
          'x-user-role': Role.OWNER,
          'x-user-id': ownerAUserId,
          'x-company-id': companyA,
          'x-session-company-id': companyA,
        },
      });
      const setRes = await getSettings(setReq);
      expect(setRes.status).toBe(200);

      // Settings PUT
      const putReq = new NextRequest('http://localhost/api/merchant/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.OWNER,
          'x-user-id': ownerAUserId,
          'x-company-id': companyA,
          'x-session-company-id': companyA,
        },
        body: JSON.stringify({
          dbaName: 'Acme Advanced Cloud',
        }),
      });
      const putRes = await putSettings(putReq);
      expect(putRes.status).toBe(200);
      const putData = await putRes.json();
      expect(putData.settings.dbaName).toBe('Acme Advanced Cloud');
    });

    it('returns HTTP 403 Forbidden on cross-tenant tampering attempt', async () => {
      const tamperReq = new NextRequest('http://localhost/api/merchant/dashboard', {
        headers: {
          'x-user-role': Role.OWNER,
          'x-user-id': ownerAUserId,
          'x-company-id': companyB, // Target company B
          'x-session-company-id': companyA, // Session company A
        },
      });
      const res = await getDashboardMetrics(tamperReq);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.detail).toMatch(/Tenant boundary breach/i);
    });
  });
});
