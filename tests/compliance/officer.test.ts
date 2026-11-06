// path: tests/compliance/officer.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  ComplianceOfficerRepository,
  proposeComplianceOfficerAppointment,
  approveComplianceOfficerAppointment,
  getPublicComplianceOfficerDisclosure,
  resetComplianceOfficerForTest,
} from '@/lib/compliance/officer';
import { AuditLogRepository } from '@/lib/db/audit';
import { GET as getOfficerDetails, POST as postOfficerAction } from '@/app/api/office/compliance-officer/route';

describe('Step 078: Designated Compliance Officer Settings & Registry', () => {
  const superAdminId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const ceoId = '018f6c4c-3500-7fa1-b1e2-100000000001';
  const supportStaffId = '018f6c4c-3500-7fa1-b1e2-400000000004';

  let officerRepo: ComplianceOfficerRepository;
  let auditRepo: AuditLogRepository;
  let loggedAuditEvents: any[];

  beforeEach(async () => {
    resetComplianceOfficerForTest();
    officerRepo = new ComplianceOfficerRepository();
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

    // Seed initial active officer
    await officerRepo.create({
      id: '018f6c4c-3500-7fa1-b1e2-990000000001',
      company_id: '00000000-0000-7000-8000-000000000000',
      officer_name: 'Dr. Sarah Jenkins, CAMS',
      official_email: 'compliance.officer@kdsolution.it',
      regulator_registration_number: 'FINCEN-MSB-2026-99128',
      contact_phone: '+1 (800) 555-0199',
      appointment_date: '2026-01-01T00:00:00.000Z',
      jurisdiction: 'US-Delaware / EU-EEA Unified Facilitator',
      status: 'active',
      appointed_by: superAdminId,
      ceo_approved_by: ceoId,
      ceo_approved_at: '2026-01-01T00:00:00.000Z',
      change_justification: 'Foundational appointment under FinCEN & EBA Payment Facilitator rules',
    });
  });

  describe('Step 078.1 & Step 078.2: Super Admin Proposal & Dual-Control CEO Approval Gate', () => {
    it('allows Super Admin to propose an updated officer, holding it in pending status', async () => {
      const justification = 'Board of Directors appointment of new Chief AML Officer following FinCEN licensing';

      const proposal = await proposeComplianceOfficerAppointment(
        {
          officerName: 'Marcus Vance, CAMS, CRCM',
          officialEmail: 'marcus.vance@kdsolution.it',
          regulatorRegistrationNumber: 'FINCEN-MSB-2026-99881',
          contactPhone: '+1 (800) 555-0188',
          jurisdiction: 'US-Delaware / EU-EEA',
          appointedBy: superAdminId,
          actorRole: Role.SUPER_ADMIN,
          justification,
        },
        { repo: officerRepo, auditRepo }
      );

      expect(proposal).toBeDefined();
      expect(proposal.officer_name).toBe('Marcus Vance, CAMS, CRCM');
      expect(proposal.status).toBe('pending_ceo_approval');
      expect(proposal.ceo_approved_by).toBeNull();
      expect(proposal.ceo_approved_at).toBeNull();

      // Verify active officer is still Sarah Jenkins
      const active = await officerRepo.getActiveOfficer();
      expect(active?.officer_name).toBe('Dr. Sarah Jenkins, CAMS');

      // Verify audit trail entry
      expect(loggedAuditEvents).toHaveLength(1);
      expect(loggedAuditEvents[0].action).toBe('COMPLIANCE_OFFICER_APPOINTMENT_PROPOSED');
      expect(loggedAuditEvents[0].actor_id).toBe(superAdminId);
    });

    it('rejects proposal by unauthorized roles (support, finance, client) with Access Denied', async () => {
      await expect(
        proposeComplianceOfficerAppointment(
          {
            officerName: 'Unauthorized Officer',
            officialEmail: 'hacker@example.com',
            regulatorRegistrationNumber: 'FAKE-1234',
            contactPhone: '+1 555 0000',
            appointedBy: supportStaffId,
            actorRole: Role.SUPPORT,
            justification: 'Attempted self-appointment',
          },
          { repo: officerRepo, auditRepo }
        )
      ).rejects.toThrow(/Access Denied/);
    });

    it('requires CEO role to confirm and finalize appointment, updating active state and superseding previous officer', async () => {
      // 1. Super Admin proposes
      const proposal = await proposeComplianceOfficerAppointment(
        {
          officerName: 'Elena Rostova, CAMS',
          officialEmail: 'elena.rostova@kdsolution.it',
          regulatorRegistrationNumber: 'FCA-AML-448102',
          contactPhone: '+44 20 7946 0991',
          jurisdiction: 'UK-FCA / EU-EBA',
          appointedBy: superAdminId,
          actorRole: Role.SUPER_ADMIN,
          justification: 'UK / European expansion compliance lead appointment',
        },
        { repo: officerRepo, auditRepo }
      );

      // 2. Non-CEO role (Super Admin) attempting to approve is rejected
      await expect(
        approveComplianceOfficerAppointment(
          {
            appointmentId: proposal.id,
            ceoUserId: superAdminId,
            ceoRole: Role.SUPER_ADMIN,
          },
          { repo: officerRepo, auditRepo }
        )
      ).rejects.toThrow(/Only CEO can confirm/);

      // 3. CEO confirms appointment
      const approved = await approveComplianceOfficerAppointment(
        {
          appointmentId: proposal.id,
          ceoUserId: ceoId,
          ceoRole: Role.CEO,
          approvalNotes: 'Formally approved by Chief Executive Officer following board ratification.',
        },
        { repo: officerRepo, auditRepo }
      );

      expect(approved.status).toBe('active');
      expect(approved.ceo_approved_by).toBe(ceoId);
      expect(approved.ceo_approved_at).toBeDefined();

      // Verify previous officer is now superseded
      const prevOfficer = await officerRepo.findById('018f6c4c-3500-7fa1-b1e2-990000000001');
      expect(prevOfficer?.status).toBe('superseded');

      // Verify active officer is now Elena Rostova
      const active = await officerRepo.getActiveOfficer();
      expect(active?.id).toBe(proposal.id);
      expect(active?.officer_name).toBe('Elena Rostova, CAMS');

      // Step 078.4: Verify audit log for CEO approval
      const approvalAudit = loggedAuditEvents.find(
        (e) => e.action === 'COMPLIANCE_OFFICER_APPOINTMENT_CONFIRMED'
      );
      expect(approvalAudit).toBeDefined();
      expect(approvalAudit.actor_id).toBe(ceoId);
    });
  });

  describe('Step 078.3: Public Compliance Officer Disclosure', () => {
    it('formats active compliance officer contact details for legal disclaimers and public disclosure', async () => {
      const disclosure = await getPublicComplianceOfficerDisclosure(officerRepo);

      expect(disclosure).toBeDefined();
      expect(disclosure.officerName).toBe('Dr. Sarah Jenkins, CAMS');
      expect(disclosure.officialEmail).toBe('compliance.officer@kdsolution.it');
      expect(disclosure.regulatorRegistration).toBe('FINCEN-MSB-2026-99128');
      expect(disclosure.jurisdiction).toBe('US-Delaware / EU-EEA Unified Facilitator');
      expect(disclosure.contactPhone).toBe('+1 (800) 555-0199');
    });
  });

  describe('HTTP API Route Integration: /api/office/compliance-officer', () => {
    it('returns public disclosure and pending state via GET', async () => {
      const req = new NextRequest('http://localhost/api/office/compliance-officer');
      const res = await getOfficerDetails(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.disclosure).toBeDefined();
      expect(data.disclosure.officerName).toBeDefined();
    });

    it('rejects unauthorized role attempting to propose via POST', async () => {
      const req = new NextRequest('http://localhost/api/office/compliance-officer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.SUPPORT,
          'x-user-id': supportStaffId,
        },
        body: JSON.stringify({
          action: 'propose',
          officerName: 'Hacker Officer',
          officialEmail: 'hacker@kdsolution.it',
          regulatorRegistrationNumber: 'TEST-123',
          contactPhone: '+1 555 0000',
          justification: 'Malicious modification attempt',
        }),
      });

      const res = await postOfficerAction(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.title).toBe('Access Denied');
    });
  });
});
