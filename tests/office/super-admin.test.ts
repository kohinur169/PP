// path: tests/office/super-admin.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Role, Permission, hasPermission } from '@/lib/auth/roles';
import {
  getPlatformSettings,
  updatePlatformSettings,
  resetPlatformSettingsForTest,
} from '@/lib/office/platform-settings';
import {
  delegateStaffRole,
  getStaffRole,
  resetStaffRoleRegistryForTest,
  setStaffRoleForTest,
} from '@/lib/office/staff-delegation';
import { issueStepUpTicket, clearStepUpRegistry } from '@/lib/auth/step-up';
import { AuditLogRepository } from '@/lib/db/audit';
import { UserRepository } from '@/lib/db/users';
import { POST as settingsPostHandler } from '@/app/api/office/settings/route';
import { POST as staffRolesPostHandler } from '@/app/api/office/staff/roles/route';

describe('Step 066: Super Admin Global Dashboard Architecture', () => {
  let auditRepo: AuditLogRepository;
  let userRepo: UserRepository;

  const SUPER_ADMIN_ID = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const TARGET_STAFF_ID = '018f6c4c-3500-7fa1-b1e2-200000000002';
  const SUPPORT_STAFF_ID = '018f6c4c-3500-7fa1-b1e2-300000000003';

  beforeEach(async () => {
    auditRepo = new AuditLogRepository();
    userRepo = new UserRepository();
    resetPlatformSettingsForTest();
    resetStaffRoleRegistryForTest();
    clearStepUpRegistry();

    // Seed target staff user
    await userRepo.createUser({
      id: TARGET_STAFF_ID,
      email: 'staff.target@kdsolution.it',
      full_legal_name: 'Target Staff Member',
      password_hash: '$2b$12$eXampleHashedPasswordForTest000000000000000000000000000',
      company_id: '00000000-0000-7000-8000-000000000000',
      is_staff: true,
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
    });
  });

  describe('Step 066.1: Super Admin Layout & Authority Scoping', () => {
    it('grants Super Admin full authority over platform settings and role delegation', () => {
      expect(hasPermission(Role.SUPER_ADMIN, Permission.MANAGE_PLATFORM_SETTINGS)).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, Permission.DELEGATE_PERMISSIONS)).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, Permission.MANAGE_GATEWAYS)).toBe(true);
      expect(hasPermission(Role.SUPER_ADMIN, Permission.VIEW_AUDIT_LOGS)).toBe(true);
    });

    it('strictly denies Support and Blogger roles from managing platform settings or role delegation', () => {
      expect(hasPermission(Role.SUPPORT, Permission.MANAGE_PLATFORM_SETTINGS)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.DELEGATE_PERMISSIONS)).toBe(false);
      expect(hasPermission(Role.BLOGGER, Permission.MANAGE_PLATFORM_SETTINGS)).toBe(false);
      expect(hasPermission(Role.BLOGGER, Permission.DELEGATE_PERMISSIONS)).toBe(false);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_PLATFORM_SETTINGS)).toBe(false);
    });
  });

  describe('Step 066.2 & Step 066.4: General Platform Settings & Step-Up 2FA Gating', () => {
    it('retrieves default factory platform settings', async () => {
      const settings = await getPlatformSettings();
      expect(settings.platformName).toBe('KD Solution PayFac');
      expect(settings.logoUrl).toBe('/images/logo.png');
      expect(settings.baseCurrency).toBe('USD');
      expect(settings.defaultFeePercent).toBe('2.9000');
      expect(settings.defaultReservePercent).toBe('10.0000');
      expect(settings.emergencyKillswitch).toBe(false);
    });

    it('Step 066.4: Demands Step-Up Challenge when ticket is missing on settings update', async () => {
      const result = await updatePlatformSettings(
        {
          platformName: 'Updated Brand PayFac',
          defaultFeePercent: '3.1000',
        },
        {
          actorId: SUPER_ADMIN_ID,
          actorRole: Role.SUPER_ADMIN,
          // No step-up ticket provided
          auditRepo,
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.challengeRequired).toBe(true);
        expect(result.challenge.action).toBe('MANAGE_PLATFORM_SETTINGS');
        expect(result.challenge.message).toContain('Step-up reauthentication required');
      }

      // Verify settings were not mutated
      const current = await getPlatformSettings();
      expect(current.platformName).toBe('KD Solution PayFac');
    });

    it('Step 066.4: Rejects settings update with expired or foreign step-up ticket', async () => {
      // Ticket issued for different action
      const foreignTicket = issueStepUpTicket(SUPER_ADMIN_ID, 'MODIFY_BANK_ACCOUNT');

      const result = await updatePlatformSettings(
        { platformName: 'Tampered Brand' },
        {
          actorId: SUPER_ADMIN_ID,
          actorRole: Role.SUPER_ADMIN,
          stepUpTicket: foreignTicket.id,
          auditRepo,
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.challengeRequired).toBe(true);
      }
    });

    it('denies non-super-admin staff from updating platform settings even with step-up ticket', async () => {
      const ticket = issueStepUpTicket(SUPPORT_STAFF_ID, 'MANAGE_PLATFORM_SETTINGS');

      await expect(
        updatePlatformSettings(
          { platformName: 'Support Hijack' },
          {
            actorId: SUPPORT_STAFF_ID,
            actorRole: Role.SUPPORT,
            stepUpTicket: ticket.id,
            auditRepo,
          }
        )
      ).rejects.toThrow(/Access Denied/);
    });

    it('successfully mutates platform settings with valid step-up ticket and generates audit log', async () => {
      const ticket = issueStepUpTicket(SUPER_ADMIN_ID, 'MANAGE_PLATFORM_SETTINGS');

      const result = await updatePlatformSettings(
        {
          platformName: 'Enterprise PayFac Global',
          logoUrl: '/assets/enterprise-logo.png',
          supportEmail: 'ops@kdsolution.it',
          supportPhone: '+1-888-555-0100',
          defaultFeePercent: '2.5000',
          defaultReservePercent: '8.0000',
          emergencyKillswitch: true,
        },
        {
          actorId: SUPER_ADMIN_ID,
          actorRole: Role.SUPER_ADMIN,
          stepUpTicket: ticket.id,
          auditRepo,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.settings.platformName).toBe('Enterprise PayFac Global');
        expect(result.settings.logoUrl).toBe('/assets/enterprise-logo.png');
        expect(result.settings.defaultFeePercent).toBe('2.5000');
        expect(result.settings.defaultReservePercent).toBe('8.0000');
        expect(result.settings.emergencyKillswitch).toBe(true);
      }

      // Check audit log
      const logs = await auditRepo.findMany();
      const settingsLog = logs.find((l) => l.action === 'PLATFORM_SETTINGS_UPDATED');
      expect(settingsLog).toBeDefined();
      expect(settingsLog?.actor_id).toBe(SUPER_ADMIN_ID);
      const changes = settingsLog?.payload.changes as Record<string, unknown>;
      expect(changes.platformName).toBe('Enterprise PayFac Global');
      expect(changes.emergencyKillswitch).toBe(true);
    });
  });

  describe('Step 066.3 & Step 066.4: Staff Role Delegation', () => {
    it('demands step-up ticket when delegating staff role', async () => {
      const result = await delegateStaffRole(
        {
          targetUserId: TARGET_STAFF_ID,
          newRole: Role.COMPLIANCE_KYC,
          reason: 'Promoted to Compliance Officer after certification',
        },
        {
          actorId: SUPER_ADMIN_ID,
          actorRole: Role.SUPER_ADMIN,
          // No step-up ticket
          auditRepo,
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.challengeRequired).toBe(true);
        expect(result.challenge.action).toBe('DELEGATE_STAFF_ROLE');
      }
    });

    it('rejects delegation when target role is not an office role (e.g. sub-merchant owner)', async () => {
      const ticket = issueStepUpTicket(SUPER_ADMIN_ID, 'DELEGATE_STAFF_ROLE');

      await expect(
        delegateStaffRole(
          {
            targetUserId: TARGET_STAFF_ID,
            newRole: Role.OWNER, // Sub-merchant role, NOT office role!
            reason: 'Invalid delegation test',
          },
          {
            actorId: SUPER_ADMIN_ID,
            actorRole: Role.SUPER_ADMIN,
            stepUpTicket: ticket.id,
            auditRepo,
          }
        )
      ).rejects.toThrow(/not an authorized office staff role/);
    });

    it('denies non-super-admin staff from delegating roles', async () => {
      const ticket = issueStepUpTicket(SUPPORT_STAFF_ID, 'DELEGATE_STAFF_ROLE');

      await expect(
        delegateStaffRole(
          {
            targetUserId: TARGET_STAFF_ID,
            newRole: Role.CEO,
            reason: 'Unauthorized elevation',
          },
          {
            actorId: SUPPORT_STAFF_ID,
            actorRole: Role.SUPPORT,
            stepUpTicket: ticket.id,
            auditRepo,
          }
        )
      ).rejects.toThrow(/Access Denied/);
    });

    it('successfully delegates office role with step-up verification and logs audit event', async () => {
      setStaffRoleForTest(TARGET_STAFF_ID, Role.SUPPORT);

      const ticket = issueStepUpTicket(SUPER_ADMIN_ID, 'DELEGATE_STAFF_ROLE');

      const result = await delegateStaffRole(
        {
          targetUserId: TARGET_STAFF_ID,
          newRole: Role.COMPLIANCE_KYC,
          reason: 'Promoted to Compliance Lead following credentials audit',
        },
        {
          actorId: SUPER_ADMIN_ID,
          actorRole: Role.SUPER_ADMIN,
          stepUpTicket: ticket.id,
          auditRepo,
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.oldRole).toBe(Role.SUPPORT);
        expect(result.newRole).toBe(Role.COMPLIANCE_KYC);
        expect(result.staffMember.role).toBe(Role.COMPLIANCE_KYC);
      }

      expect(getStaffRole(TARGET_STAFF_ID)).toBe(Role.COMPLIANCE_KYC);

      // Verify audit log
      const logs = await auditRepo.findMany();
      const delLog = logs.find((l) => l.action === 'STAFF_ROLE_DELEGATED');
      expect(delLog).toBeDefined();
      expect(delLog?.actor_id).toBe(SUPER_ADMIN_ID);
      expect(delLog?.payload.oldRole).toBe(Role.SUPPORT);
      expect(delLog?.payload.newRole).toBe(Role.COMPLIANCE_KYC);
      expect(delLog?.payload.reason).toBe(
        'Promoted to Compliance Lead following credentials audit'
      );
    });
  });

  describe('HTTP API Endpoints Integration Verification Gate', () => {
    it('POST /api/office/settings returns 428 Precondition Required when step-up ticket is missing', async () => {
      const request = new Request('http://localhost:3000/api/office/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': SUPER_ADMIN_ID,
          'x-staff-role': 'super_admin',
        },
        body: JSON.stringify({
          platformName: 'New Platform Brand',
        }),
      });

      const response = await settingsPostHandler(request, { auditRepo });
      expect(response.status).toBe(428);

      const json = await response.json();
      expect(json.title).toBe('Step-Up Reauthentication Required');
      expect(json.challenge?.action).toBe('MANAGE_PLATFORM_SETTINGS');
    });

    it('POST /api/office/settings returns 403 Forbidden when called by unauthorized role', async () => {
      const ticket = issueStepUpTicket(SUPPORT_STAFF_ID, 'MANAGE_PLATFORM_SETTINGS');

      const request = new Request('http://localhost:3000/api/office/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': SUPPORT_STAFF_ID,
          'x-staff-role': 'support',
          'x-step-up-ticket': ticket.id,
        },
        body: JSON.stringify({
          platformName: 'Unauthorized Name',
        }),
      });

      const response = await settingsPostHandler(request, { auditRepo });
      expect(response.status).toBe(403);
    });

    it('POST /api/office/settings succeeds with 200 OK when Super Admin provides valid step-up ticket', async () => {
      const ticket = issueStepUpTicket(SUPER_ADMIN_ID, 'MANAGE_PLATFORM_SETTINGS');

      const request = new Request('http://localhost:3000/api/office/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': SUPER_ADMIN_ID,
          'x-staff-role': 'super_admin',
          'x-step-up-ticket': ticket.id,
        },
        body: JSON.stringify({
          platformName: 'KD PayFac Enterprise Production',
          defaultFeePercent: '2.8500',
        }),
      });

      const response = await settingsPostHandler(request, { auditRepo });
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.settings?.platformName).toBe('KD PayFac Enterprise Production');
      expect(json.settings?.defaultFeePercent).toBe('2.8500');
    });

    it('POST /api/office/staff/roles returns 428 Precondition Required when step-up ticket is missing', async () => {
      const request = new Request('http://localhost:3000/api/office/staff/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': SUPER_ADMIN_ID,
          'x-staff-role': 'super_admin',
        },
        body: JSON.stringify({
          targetUserId: TARGET_STAFF_ID,
          newRole: 'finance_ops',
          reason: 'Promotion without 2FA',
        }),
      });

      const response = await staffRolesPostHandler(request, { userRepo, auditRepo });
      expect(response.status).toBe(428);

      const json = await response.json();
      expect(json.title).toBe('Step-Up Reauthentication Required');
      expect(json.challenge?.action).toBe('DELEGATE_STAFF_ROLE');
    });

    it('POST /api/office/staff/roles succeeds with 200 OK when Super Admin provides valid step-up ticket', async () => {
      const ticket = issueStepUpTicket(SUPER_ADMIN_ID, 'DELEGATE_STAFF_ROLE');

      const request = new Request('http://localhost:3000/api/office/staff/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': SUPER_ADMIN_ID,
          'x-staff-role': 'super_admin',
          'x-step-up-ticket': ticket.id,
        },
        body: JSON.stringify({
          targetUserId: TARGET_STAFF_ID,
          newRole: 'finance_ops',
          reason: 'Assigned to Finance Operations squad',
        }),
      });

      const response = await staffRolesPostHandler(request, { userRepo, auditRepo });
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.newRole).toBe('finance_ops');
    });
  });
});
