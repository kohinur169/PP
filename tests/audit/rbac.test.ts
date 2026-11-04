// path: tests/audit/rbac.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  logPermissionChange,
  isRoleElevation,
  getDispatchedSecurityAlerts,
  clearDispatchedSecurityAlerts,
  getPermissionChangeAuditEntries,
  clearPermissionChangeAuditEntries,
} from '@/lib/audit/rbac';
import {
  delegateStaffRole,
  resetStaffRoleRegistryForTest,
  setStaffRoleForTest,
} from '@/lib/office/staff-delegation';
import { issueStepUpTicket } from '@/lib/auth/step-up';
import { AuditLogRepository } from '@/lib/db/audit';
import { UserRepository } from '@/lib/db/users';
import { GET as getAuditPermissions, POST as postAuditPermissions } from '@/app/api/office/audit/permissions/route';

describe('Step 075: Permission Elevation & Delegation Audit Trail', () => {
  const superAdminId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const targetStaffId = '018f6c4c-3500-7fa1-b1e2-200000000002';
  const clientIp = '198.51.100.44';

  let auditRepo: AuditLogRepository;
  let userRepo: UserRepository;
  let loggedAuditEntries: any[];

  beforeEach(async () => {
    clearDispatchedSecurityAlerts();
    clearPermissionChangeAuditEntries();
    resetStaffRoleRegistryForTest();
    loggedAuditEntries = [];

    auditRepo = {
      createLog: async (input: any) => {
        loggedAuditEntries.push(input);
        return {
          id: `audit_mock_${Date.now()}`,
          ...input,
          created_at: new Date().toISOString(),
        } as any;
      },
    } as unknown as AuditLogRepository;

    userRepo = new UserRepository();
    await userRepo.create({
      id: targetStaffId,
      email: 'staff.officer@kdsolution.it',
      full_legal_name: 'Staff Officer Candidate',
      password_hash: '$argon2id$v=19$m=65536,t=3,p=4$fakeHash$validHash',
      failed_attempts: 0,
      locked_until: null,
      password_changed_at: new Date().toISOString(),
      company_id: '00000000-0000-7000-8000-000000000000',
      status: 'active',
      is_staff: true,
    });
  });

  describe('Step 075.1: Permission Change Audit Logging Engine', () => {
    it('promotes user from support to compliance_kyc and verifies audit entry generation', async () => {
      const reason = 'Promoted to Compliance Officer to manage KYB reviews and SAR filings';

      const entry = await logPermissionChange(
        superAdminId,
        targetStaffId,
        Role.SUPPORT,
        Role.COMPLIANCE_KYC,
        reason,
        {
          ipAddress: clientIp,
          userAgent: 'Test-Agent/1.0',
          auditRepo,
        }
      );

      // Verify returned audit entry structure
      expect(entry).toBeDefined();
      expect(entry.actorId).toBe(superAdminId);
      expect(entry.targetUserId).toBe(targetStaffId);
      expect(entry.oldRole).toBe(Role.SUPPORT);
      expect(entry.newRole).toBe(Role.COMPLIANCE_KYC);
      expect(entry.reason).toBe(reason);
      expect(entry.ipAddress).toBe(clientIp);
      expect(entry.isElevation).toBe(true);
      expect(entry.timestamp).toBeDefined();
      expect(entry.auditLogId).toBeDefined();

      // Verify repository persistence
      expect(loggedAuditEntries).toHaveLength(1);
      const auditPayload = loggedAuditEntries[0];
      expect(auditPayload.action).toBe('STAFF_ROLE_DELEGATED');
      expect(auditPayload.entity_type).toBe('user_role');
      expect(auditPayload.entity_id).toBe(targetStaffId);
      expect(auditPayload.actor_id).toBe(superAdminId);
      expect(auditPayload.payload.isElevation).toBe(true);
      expect(auditPayload.payload.oldRole).toBe(Role.SUPPORT);
      expect(auditPayload.payload.newRole).toBe(Role.COMPLIANCE_KYC);
    });

    it('rejects logging when mandatory actor, target, or justification is missing', async () => {
      await expect(
        logPermissionChange('', targetStaffId, Role.SUPPORT, Role.COMPLIANCE_KYC, 'Valid justification reason')
      ).rejects.toThrow(/Granting actor ID is required/);

      await expect(
        logPermissionChange(superAdminId, '', Role.SUPPORT, Role.COMPLIANCE_KYC, 'Valid justification reason')
      ).rejects.toThrow(/Recipient target user ID is required/);

      await expect(
        logPermissionChange(superAdminId, targetStaffId, Role.SUPPORT, Role.COMPLIANCE_KYC, 'few')
      ).rejects.toThrow(/Justification reason must be at least 5 characters/);
    });

    it('evaluates role privilege elevation and lateral delegation correctly', () => {
      expect(isRoleElevation(Role.SUPPORT, Role.COMPLIANCE_KYC)).toBe(true);
      expect(isRoleElevation(Role.SUPPORT, Role.FINANCE_OPS)).toBe(true);
      expect(isRoleElevation(Role.FINANCE_OPS, Role.SUPER_ADMIN)).toBe(true);
      expect(isRoleElevation(Role.COMPLIANCE_KYC, Role.CEO)).toBe(true);

      // Lateral or demotion transitions
      expect(isRoleElevation(Role.SUPPORT, Role.BLOGGER)).toBe(false);
      expect(isRoleElevation(Role.SUPER_ADMIN, Role.SUPPORT)).toBe(false);
      expect(isRoleElevation(Role.CEO, Role.COMPLIANCE_KYC)).toBe(false);
    });
  });

  describe('Step 075.2: Executive Automated Security Alerts (CEO & Super Admin)', () => {
    it('dispatches automated security alerts to both CEO and Super Admin on role delegation', async () => {
      const reason = 'Assigned to reconciliation queue and settlement management';

      const entry = await logPermissionChange(
        superAdminId,
        targetStaffId,
        Role.SUPPORT,
        Role.FINANCE_OPS,
        reason,
        {
          ipAddress: clientIp,
          auditRepo,
        }
      );

      const alerts = getDispatchedSecurityAlerts();
      expect(alerts).toHaveLength(2);

      const ceoAlert = alerts.find((a) => a.recipientRole === Role.CEO);
      const superAdminAlert = alerts.find((a) => a.recipientRole === Role.SUPER_ADMIN);

      expect(ceoAlert).toBeDefined();
      expect(superAdminAlert).toBeDefined();

      expect(ceoAlert?.type).toBe('ROLE_ELEVATION');
      expect(ceoAlert?.severity).toBe('HIGH');
      expect(ceoAlert?.targetUserId).toBe(targetStaffId);
      expect(ceoAlert?.actorId).toBe(superAdminId);
      expect(ceoAlert?.message).toContain('finance_ops');
      expect(ceoAlert?.message).toContain(reason);

      expect(superAdminAlert?.type).toBe('ROLE_ELEVATION');
      expect(superAdminAlert?.severity).toBe('HIGH');
    });

    it('flags elevation to Super Admin or CEO with CRITICAL severity', async () => {
      await logPermissionChange(
        superAdminId,
        targetStaffId,
        Role.FINANCE_OPS,
        Role.SUPER_ADMIN,
        'Executive platform co-administrator promotion under dual-control approval',
        {
          ipAddress: clientIp,
          auditRepo,
        }
      );

      const alerts = getDispatchedSecurityAlerts();
      expect(alerts).toHaveLength(2);
      expect(alerts[0].severity).toBe('CRITICAL');
      expect(alerts[1].severity).toBe('CRITICAL');
    });
  });

  describe('Integration with delegateStaffRole Engine', () => {
    it('triggers permission audit log and executive alerts when delegateStaffRole is invoked', async () => {
      setStaffRoleForTest(targetStaffId, Role.SUPPORT);
      const ticket = issueStepUpTicket(superAdminId, 'DELEGATE_STAFF_ROLE');

      const result = await delegateStaffRole(
        {
          targetUserId: targetStaffId,
          newRole: Role.COMPLIANCE_KYC,
          reason: 'Promotion to Compliance Officer for AML/KYC review queue',
        },
        {
          actorId: superAdminId,
          actorRole: Role.SUPER_ADMIN,
          stepUpTicket: ticket.id,
          userRepo,
          auditRepo,
          clientIp,
        }
      );

      expect(result.success).toBe(true);

      // Verify that logPermissionChange was triggered and alert dispatched
      const alerts = getDispatchedSecurityAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(2);
      expect(alerts.some((a) => a.recipientRole === Role.CEO)).toBe(true);
      expect(alerts.some((a) => a.recipientRole === Role.SUPER_ADMIN)).toBe(true);

      const recordedEntries = getPermissionChangeAuditEntries();
      expect(recordedEntries.length).toBeGreaterThanOrEqual(1);
      const transition = recordedEntries[0];
      expect(transition.targetUserId).toBe(targetStaffId);
      expect(transition.newRole).toBe(Role.COMPLIANCE_KYC);
    });
  });

  describe('Step 075.3: Office Audit API Route Integration', () => {
    it('allows authorized Super Admin and CEO to query permission audit reports', async () => {
      await logPermissionChange(
        superAdminId,
        targetStaffId,
        Role.SUPPORT,
        Role.COMPLIANCE_KYC,
        'Compliance promotion queue',
        { auditRepo }
      );

      const req = new NextRequest('http://localhost/api/office/audit/permissions', {
        headers: {
          'x-user-role': Role.SUPER_ADMIN,
          'x-user-id': superAdminId,
        },
      });

      const res = await getAuditPermissions(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.entries[0].targetUserId).toBe(targetStaffId);
    });

    it('rejects unauthorized roles (support, blogger, owner) with HTTP 403', async () => {
      const req = new NextRequest('http://localhost/api/office/audit/permissions', {
        headers: {
          'x-user-role': Role.SUPPORT,
          'x-user-id': '018f6c4c-3500-7fa1-b1e2-400000000004',
        },
      });

      const res = await getAuditPermissions(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.title).toBe('Access Denied');
    });

    it('creates permission audit record via POST /api/office/audit/permissions for Super Admin', async () => {
      const req = new NextRequest('http://localhost/api/office/audit/permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.SUPER_ADMIN,
          'x-user-id': superAdminId,
        },
        body: JSON.stringify({
          targetUserId: targetStaffId,
          oldRole: Role.SUPPORT,
          newRole: Role.FINANCE_OPS,
          reason: 'Daily finance operations shift rotation',
        }),
      });

      const res = await postAuditPermissions(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.entry.newRole).toBe(Role.FINANCE_OPS);
      expect(data.entry.isElevation).toBe(true);
    });
  });
});
