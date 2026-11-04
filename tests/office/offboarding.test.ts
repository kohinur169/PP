// path: tests/office/offboarding.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import { UserRepository } from '@/lib/db/users';
import { SessionRepository } from '@/lib/db/sessions';
import { UserMfaRepository } from '@/lib/db/mfa';
import { CompanyMemberRepository } from '@/lib/db/memberships';
import { AuditLogRepository } from '@/lib/db/audit';
import { createSession, getActiveSessionById, clearSessionRegistry } from '@/lib/auth/session';
import { authenticateUser } from '@/lib/auth/login';
import { issueStepUpTicket } from '@/lib/auth/step-up';
import { offboardStaffMember, setOffboardingDependenciesForTest } from '@/lib/office/offboarding';
import { POST as postOffboardStaff } from '@/app/api/office/staff/[id]/offboard/route';

describe('Step 074: Same-Day Staff Offboarding & Automated Revocation Checklist', () => {
  const superAdminId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const complianceOfficerId = '018f6c4c-3500-7fa1-b1e2-200000000002';
  const companyId = '00000000-0000-7000-8000-000000000000';

  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let mfaRepo: UserMfaRepository;
  let membershipRepo: CompanyMemberRepository;
  let auditRepo: AuditLogRepository;
  let auditLogsRecorded: any[];

  beforeEach(async () => {
    clearSessionRegistry();
    auditLogsRecorded = [];

    userRepo = new UserRepository();
    sessionRepo = new SessionRepository();
    mfaRepo = new UserMfaRepository();
    membershipRepo = new CompanyMemberRepository();

    auditRepo = {
      createLog: async (input: any) => {
        auditLogsRecorded.push(input);
        return {} as any;
      },
      append: async (input: any) => {
        auditLogsRecorded.push(input);
        return {} as any;
      },
    } as unknown as AuditLogRepository;

    setOffboardingDependenciesForTest({
      userRepo,
      sessionRepo,
      mfaRepo,
      membershipRepo,
      auditRepo,
    });

    // Seed target staff user
    await userRepo.create({
      id: complianceOfficerId,
      email: 'ex.officer@kdsolution.it',
      full_legal_name: 'Jonathan Ex-Compliance',
      password_hash: '$argon2id$v=19$m=65536,t=3,p=4$fakeHash123$validHash',
      failed_attempts: 0,
      locked_until: null,
      password_changed_at: new Date().toISOString(),
      company_id: companyId,
      status: 'active',
      is_staff: true,
    });

    // Seed an active session for target staff
    createSession({
      token: 'session_active_compliance_officer_token_123',
      userId: complianceOfficerId,
      tenantId: companyId,
      device: { ip: '198.51.100.44', userAgent: 'Chrome' },
    });
  });

  afterEach(() => {
    setOffboardingDependenciesForTest(null);
  });

  describe('Step 074.1: RBAC & Step-Up 2FA Reauthentication Checks', () => {
    it('rejects offboarding attempts by non-Super Admin roles with Access Denied', async () => {
      await expect(
        offboardStaffMember({
          targetStaffId: complianceOfficerId,
          actorId: '018f6c4c-3500-7fa1-b1e2-300000000003',
          actorRole: Role.FINANCE_OPS,
          reason: 'Unauthorized attempt',
          dependencies: { userRepo, sessionRepo, mfaRepo, membershipRepo, auditRepo },
        })
      ).rejects.toThrow(/Only Super Admin can execute staff offboarding/i);

      await expect(
        offboardStaffMember({
          targetStaffId: complianceOfficerId,
          actorId: '018f6c4c-3500-7fa1-b1e2-400000000004',
          actorRole: Role.SUPPORT,
          reason: 'Unauthorized attempt',
          dependencies: { userRepo, sessionRepo, mfaRepo, membershipRepo, auditRepo },
        })
      ).rejects.toThrow(/Only Super Admin can execute staff offboarding/i);
    });

    it('blocks self-offboarding by Super Admin to prevent governance deadlock', async () => {
      await expect(
        offboardStaffMember({
          targetStaffId: superAdminId,
          actorId: superAdminId,
          actorRole: Role.SUPER_ADMIN,
          reason: 'Accidental self-offboarding',
          dependencies: { userRepo, sessionRepo, mfaRepo, membershipRepo, auditRepo },
        })
      ).rejects.toThrow(/Self-offboarding is prohibited/i);
    });

    it('issues step-up challenge when 2FA ticket is missing or unverified', async () => {
      const res = await offboardStaffMember({
        targetStaffId: complianceOfficerId,
        actorId: superAdminId,
        actorRole: Role.SUPER_ADMIN,
        reason: 'Contract ended',
        dependencies: { userRepo, sessionRepo, mfaRepo, membershipRepo, auditRepo },
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.stepUpRequired).toBe(true);
        expect(res.challenge.action).toBe('OFFBOARD_STAFF_MEMBER');
      }
    });
  });

  describe('Step 074.2 & Step 074.3: Automated Revocation Checklist & Audit Logging', () => {
    it('executes full offboarding checklist, terminates sessions, and scrambles credentials', async () => {
      // 1. Issue valid step-up ticket
      const ticket = issueStepUpTicket(superAdminId, 'OFFBOARD_STAFF_MEMBER');

      // 2. Execute offboarding
      const res = await offboardStaffMember({
        targetStaffId: complianceOfficerId,
        actorId: superAdminId,
        actorRole: Role.SUPER_ADMIN,
        reason: 'Voluntary resignation and departure notice',
        ticketId: ticket.id,
        dependencies: { userRepo, sessionRepo, mfaRepo, membershipRepo, auditRepo },
      });

      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.targetStaffId).toBe(complianceOfficerId);
        expect(res.checklist.userStatusUpdatedToOffboarded).toBe(true);
        expect(res.checklist.credentialsScrambled).toBe(true);
        expect(res.checklist.sessionsRevokedCount).toBeGreaterThanOrEqual(1);
        expect(res.checklist.auditLogRecorded).toBe(true);
        expect(res.clearCookieHeaders).toHaveLength(1);
      }

      // 3. Verify user status in repository
      const updatedUser = await userRepo.findById(complianceOfficerId);
      expect(updatedUser?.status).toBe('offboarded');
      expect(updatedUser?.password_hash).toMatch(/^OFFBOARDED_/);

      // 4. Verify sessions are terminated immediately
      const activeSessions = await sessionRepo.findActiveByUserId(complianceOfficerId);
      expect(activeSessions).toHaveLength(0);

      // 5. Verify immutable audit log recorded
      const offboardLogs = auditLogsRecorded.filter(
        (l) => l.action === 'STAFF_OFFBOARDED_IMMEDIATELY'
      );
      expect(offboardLogs).toHaveLength(1);
      expect(offboardLogs[0].payload.targetStaffId).toBe(complianceOfficerId);
      expect(offboardLogs[0].payload.reason).toContain('Voluntary resignation');
    });

    it('permanently blocks login for offboarded staff member', async () => {
      // Set user status to offboarded
      const user = await userRepo.findById(complianceOfficerId);
      if (user) {
        await userRepo.update(user.id, user.version, {
          status: 'offboarded',
          password_hash: 'OFFBOARDED_SCRAMBLED_RANDOM_HASH_ABC',
        });
      }

      // Attempt to authenticate
      const authResult = await authenticateUser(
        {
          email: 'ex.officer@kdsolution.it',
          password: 'AnyPassword123!',
          device: { ip: '198.51.100.44', userAgent: 'Chrome' },
        },
        { userRepo, auditRepo }
      );

      expect(authResult.success).toBe(false);
      expect(authResult.error).toBe('ACCOUNT_SUSPENDED');
      expect(authResult.message).toMatch(/offboarded and permanently disabled/i);
    });
  });

  describe('Step 074.4: HTTP API Route Integration', () => {
    it('handles step-up challenge and executes offboarding via POST /api/office/staff/[id]/offboard', async () => {
      // 1. Request without ticket -> HTTP 403 with challenge
      const chalReq = new NextRequest(
        `http://localhost/api/office/staff/${complianceOfficerId}/offboard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': Role.SUPER_ADMIN,
            'x-user-id': superAdminId,
          },
          body: JSON.stringify({
            reason: 'Formal departure from platform operations',
          }),
        }
      );

      const chalRes = await postOffboardStaff(chalReq, {
        params: Promise.resolve({ id: complianceOfficerId }),
      });
      expect(chalRes.status).toBe(403);
      const chalData = await chalRes.json();
      expect(chalData.stepUpRequired).toBe(true);
      expect(chalData.challenge.action).toBe('OFFBOARD_STAFF_MEMBER');

      // 2. Issue step-up ticket and execute offboarding -> HTTP 200 with checklist
      const ticket = issueStepUpTicket(superAdminId, 'OFFBOARD_STAFF_MEMBER');

      const offboardReq = new NextRequest(
        `http://localhost/api/office/staff/${complianceOfficerId}/offboard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': Role.SUPER_ADMIN,
            'x-user-id': superAdminId,
          },
          body: JSON.stringify({
            reason: 'Formal departure from platform operations',
            ticketId: ticket.id,
          }),
        }
      );

      const offboardRes = await postOffboardStaff(offboardReq, {
        params: Promise.resolve({ id: complianceOfficerId }),
      });
      expect(offboardRes.status).toBe(200);
      const offboardData = await offboardRes.json();
      expect(offboardData.success).toBe(true);
      expect(offboardData.checklist.userStatusUpdatedToOffboarded).toBe(true);
      expect(offboardRes.headers.get('Set-Cookie')).toBeDefined();
    });

    it('rejects non-superadmin actors with HTTP 403', async () => {
      const req = new NextRequest(
        `http://localhost/api/office/staff/${complianceOfficerId}/offboard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': Role.CEO,
            'x-user-id': '018f6c4c-3500-7fa1-b1e2-100000000001',
          },
          body: JSON.stringify({
            reason: 'Unauthorized CEO attempt',
          }),
        }
      );

      const res = await postOffboardStaff(req, {
        params: Promise.resolve({ id: complianceOfficerId }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.detail).toMatch(/Only Super Admin can execute staff offboarding/i);
    });
  });
});
