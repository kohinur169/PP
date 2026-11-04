// path: tests/compliance/country-control.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  CountryControlRepository,
  seedCountryCatalog,
  proposeCountryStateChange,
  approveCountryStateChange,
  emergencyDisableCountry,
  isCountryEnabled,
  clearCountryControlStore,
  SanctionedCountryFreezeViolationError,
  DualControlSelfApprovalError,
  UnauthorizedCountryControlError,
  COMPREHENSIVELY_SANCTIONED_COUNTRIES,
} from '@/lib/compliance/country-control';
import { AuditLogRepository } from '@/lib/db/audit';
import {
  GET as getCountryControls,
  POST as postCountryControlAction,
} from '@/app/api/office/compliance/country-controls/route';

describe('Step 081: Global Country Enable/Disable Engine with Sanctioned Country Freeze', () => {
  const superAdminId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const ceoId = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const supportStaffId = '018f6c4c-3500-7fa1-b1e2-400000000004';

  let countryRepo: CountryControlRepository;
  let auditRepo: AuditLogRepository;
  let loggedAuditEvents: any[];

  beforeEach(async () => {
    clearCountryControlStore();
    countryRepo = new CountryControlRepository();
    loggedAuditEvents = [];

    auditRepo = {
      createLog: async (input: any) => {
        loggedAuditEvents.push(input);
        return {
          id: `audit_${Date.now()}`,
          ...input,
          created_at: new Date().toISOString(),
        } as any;
      },
    } as unknown as AuditLogRepository;

    await seedCountryCatalog(countryRepo);
  });

  describe('Step 081.1: Catalog Seeding & Permanent Sanctions State', () => {
    it('seeds permitted countries as enabled and sanctioned nations as permanently frozen', async () => {
      const us = await countryRepo.findByCode('US');
      expect(us?.is_enabled).toBe(true);
      expect(us?.is_sanctioned_frozen).toBe(false);

      const kp = await countryRepo.findByCode('KP');
      expect(kp?.is_enabled).toBe(false);
      expect(kp?.is_sanctioned_frozen).toBe(true);
      expect(kp?.sanctions_program).toContain('OFAC');

      const ir = await countryRepo.findByCode('IR');
      expect(ir?.is_enabled).toBe(false);
      expect(ir?.is_sanctioned_frozen).toBe(true);

      const cu = await countryRepo.findByCode('CU');
      expect(cu?.is_sanctioned_frozen).toBe(true);

      const sy = await countryRepo.findByCode('SY');
      expect(sy?.is_sanctioned_frozen).toBe(true);
    });

    it('asserts comprehensively sanctioned nations are always disabled via isCountryEnabled', async () => {
      expect(await isCountryEnabled('KP', countryRepo)).toBe(false);
      expect(await isCountryEnabled('IR', countryRepo)).toBe(false);
      expect(await isCountryEnabled('CU', countryRepo)).toBe(false);
      expect(await isCountryEnabled('SY', countryRepo)).toBe(false);

      expect(await isCountryEnabled('US', countryRepo)).toBe(true);
      expect(await isCountryEnabled('GB', countryRepo)).toBe(true);
    });
  });

  describe('Step 081.2 & Step 081.4: Permanent Sanctions Freeze Check Constraint Violation', () => {
    it('raises fatal SanctionedCountryFreezeViolationError when attempting to propose enabling North Korea (KP)', async () => {
      await expect(
        proposeCountryStateChange(
          {
            countryCode: 'KP',
            enabled: true,
            justification: 'Attempting illegal sanctions bypass for North Korea',
            actorId: superAdminId,
            actorRole: Role.SUPER_ADMIN,
          },
          { repo: countryRepo, auditRepo }
        )
      ).rejects.toThrow(SanctionedCountryFreezeViolationError);
    });

    it('raises fatal SanctionedCountryFreezeViolationError when attempting to propose enabling Iran (IR)', async () => {
      await expect(
        proposeCountryStateChange(
          {
            countryCode: 'IR',
            enabled: true,
            justification: 'Attempting illegal sanctions bypass for Iran',
            actorId: superAdminId,
            actorRole: Role.SUPER_ADMIN,
          },
          { repo: countryRepo, auditRepo }
        )
      ).rejects.toThrow(SanctionedCountryFreezeViolationError);
    });

    it('blocks direct repository update attempting to set is_enabled=true on sanctioned country', async () => {
      const kp = await countryRepo.findByCode('KP');
      expect(kp).not.toBeNull();

      await expect(
        countryRepo.update(kp!.id, kp!.version, {
          is_enabled: true,
        })
      ).rejects.toThrow(SanctionedCountryFreezeViolationError);
    });
  });

  describe('Step 081.3: Dual-Approval Workflow for Non-Sanctioned Jurisdictions', () => {
    it('executes full proposal and CEO approval lifecycle with audit logs', async () => {
      // 1. Super Admin proposes disabling Germany (DE) for compliance review
      const proposed = await proposeCountryStateChange(
        {
          countryCode: 'DE',
          enabled: false,
          justification: 'BaFin local license update required for Germany',
          actorId: superAdminId,
          actorRole: Role.SUPER_ADMIN,
        },
        { repo: countryRepo, auditRepo }
      );

      expect(proposed.pending_change_status).toBe('pending_approval');
      expect(proposed.proposed_enabled).toBe(false);
      expect(proposed.proposed_by).toBe(superAdminId);
      // Status remains enabled until approved
      expect(proposed.is_enabled).toBe(true);

      const propAudit = loggedAuditEvents.find((e) => e.action === 'COUNTRY_CONTROL_CHANGE_PROPOSED');
      expect(propAudit).toBeDefined();

      // 2. CEO approves the change
      const approved = await approveCountryStateChange(
        {
          countryCode: 'DE',
          actorId: ceoId,
          actorRole: Role.CEO,
          notes: 'BaFin compliance hold ratified by CEO.',
        },
        { repo: countryRepo, auditRepo }
      );

      expect(approved.is_enabled).toBe(false);
      expect(approved.pending_change_status).toBeNull();
      expect(approved.approved_by).toBe(ceoId);

      const appAudit = loggedAuditEvents.find((e) => e.action === 'COUNTRY_CONTROL_CHANGE_APPROVED');
      expect(appAudit).toBeDefined();

      // Verified country is now disabled
      expect(await isCountryEnabled('DE', countryRepo)).toBe(false);
    });

    it('enforces dual-control separation of duty: prevents proposer from approving their own proposal', async () => {
      await proposeCountryStateChange(
        {
          countryCode: 'CA',
          enabled: false,
          justification: 'FINTRAC policy change',
          actorId: superAdminId,
          actorRole: Role.SUPER_ADMIN,
        },
        { repo: countryRepo, auditRepo }
      );

      // Super Admin attempts self-approval
      await expect(
        approveCountryStateChange(
          {
            countryCode: 'CA',
            actorId: superAdminId, // SAME ACTOR
            actorRole: Role.SUPER_ADMIN,
          },
          { repo: countryRepo, auditRepo }
        )
      ).rejects.toThrow(DualControlSelfApprovalError);
    });

    it('rejects unauthorized roles (support, blogger, finance) with UnauthorizedCountryControlError', async () => {
      await expect(
        proposeCountryStateChange(
          {
            countryCode: 'FR',
            enabled: false,
            justification: 'Unauthorized attempt',
            actorId: supportStaffId,
            actorRole: Role.SUPPORT,
          },
          { repo: countryRepo, auditRepo }
        )
      ).rejects.toThrow(UnauthorizedCountryControlError);
    });
  });

  describe('Step 081.4: Emergency Instant Country Freeze', () => {
    it('immediately disables country without dual-control delay for urgent containment', async () => {
      const emergency = await emergencyDisableCountry(
        {
          countryCode: 'FR',
          reason: 'Mass card testing fraud wave detected from French card BINs',
          actorId: superAdminId,
          actorRole: Role.SUPER_ADMIN,
        },
        { repo: countryRepo, auditRepo }
      );

      expect(emergency.is_enabled).toBe(false);
      expect(emergency.change_justification).toContain('EMERGENCY DISABLE');

      const audit = loggedAuditEvents.find((e) => e.action === 'COUNTRY_CONTROL_EMERGENCY_DISABLED');
      expect(audit).toBeDefined();
      expect(audit.payload.countryCode).toBe('FR');

      expect(await isCountryEnabled('FR', countryRepo)).toBe(false);
    });
  });

  describe('HTTP API Route Integration: /api/office/compliance/country-controls', () => {
    it('allows office staff to query countries and summary via GET', async () => {
      const req = new NextRequest('http://localhost/api/office/compliance/country-controls', {
        headers: { 'x-user-role': Role.COMPLIANCE_KYC },
      });

      const res = await getCountryControls(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.summary.total).toBeGreaterThanOrEqual(11);
      expect(data.summary.sanctionedFrozen).toBe(4);
    });

    it('blocks unauthorized client / blogger roles from accessing GET with HTTP 403', async () => {
      const req = new NextRequest('http://localhost/api/office/compliance/country-controls', {
        headers: { 'x-user-role': Role.CLIENT },
      });

      const res = await getCountryControls(req);
      expect(res.status).toBe(403);
    });

    it('returns HTTP 422 with Sanctions Violation when attempting to enable North Korea via POST', async () => {
      const req = new NextRequest('http://localhost/api/office/compliance/country-controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.SUPER_ADMIN,
          'x-user-id': superAdminId,
        },
        body: JSON.stringify({
          action: 'propose',
          countryCode: 'KP',
          enabled: true,
          justification: 'Malicious API test attempting to enable DPRK',
        }),
      });

      const res = await postCountryControlAction(req);
      expect(res.status).toBe(422);

      const data = await res.json();
      expect(data.title).toBe('Fatal Sanctions Violation');
      expect(data.detail).toContain('permanently frozen under OFAC/UN');
    });

    it('handles valid proposal and dual approval via POST', async () => {
      // 1. Propose disabling SG
      const propReq = new NextRequest('http://localhost/api/office/compliance/country-controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.SUPER_ADMIN,
          'x-user-id': superAdminId,
        },
        body: JSON.stringify({
          action: 'propose',
          countryCode: 'SG',
          enabled: false,
          justification: 'MAS licensing maintenance',
        }),
      });

      const propRes = await postCountryControlAction(propReq);
      expect(propRes.status).toBe(200);

      // 2. Approve by CEO
      const appReq = new NextRequest('http://localhost/api/office/compliance/country-controls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.CEO,
          'x-user-id': ceoId,
        },
        body: JSON.stringify({
          action: 'approve',
          countryCode: 'SG',
          notes: 'CEO ratification confirmed',
        }),
      });

      const appRes = await postCountryControlAction(appReq);
      expect(appRes.status).toBe(200);
      const appData = await appRes.json();
      expect(appData.country.is_enabled).toBe(false);
    });
  });
});
