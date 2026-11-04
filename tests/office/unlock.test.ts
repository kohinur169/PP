// path: tests/office/unlock.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  unlockUserAccountByOffice,
  MANDATORY_CONTACT_CONFIRMATION_STATEMENT,
} from '../../lib/office/unlock';
import { issueStepUpTicket, clearStepUpRegistry } from '../../lib/auth/step-up';
import { recordFailedLoginAttempt } from '../../lib/auth/lockout';
import { authenticateUser } from '../../lib/auth/login';
import { hashPassword } from '../../lib/auth/password';
import { UserRepository } from '../../lib/db/users';
import { AuditLogRepository } from '../../lib/db/audit';
import { POST } from '../../app/api/office/users/[id]/unlock/route';
import type { DeviceCharacteristics } from '../../lib/auth/session-types';

describe('Step 051: Office Unlock Workflow with Mandatory Email Verification', () => {
  let userRepo: UserRepository;
  let auditRepo: AuditLogRepository;
  const testPassword = 'Correct#Horse#Battery#Staple#2026!';
  let lockedUserId: string;
  let lockedUserEmail: string;

  const staffActorId = '018f6c4c-3500-7fa1-b1e2-800000000001';
  const testDevice: DeviceCharacteristics = {
    ip: '198.51.100.123',
    userAgent: 'OfficeDashboard/2026',
    acceptLanguage: 'en-US',
  };

  beforeEach(async () => {
    clearStepUpRegistry();
    userRepo = new UserRepository();
    auditRepo = new AuditLogRepository();

    lockedUserEmail = `locked.merchant.${Date.now()}.${Math.random().toString(36).substring(2, 6)}@kdsolution.it`;
    const passwordHash = await hashPassword(testPassword);

    const user = await userRepo.createUser({
      email: lockedUserEmail,
      full_legal_name: 'Ludovico Einaudi',
      password_hash: passwordHash,
      status: 'active',
      is_staff: false,
      failed_attempts: 0,
      locked_until: null,
    });
    lockedUserId = user.id;

    // Simulate 2 consecutive failed attempts to lock account for 2 hours
    await recordFailedLoginAttempt(lockedUserId, { userRepo, auditRepo });
    await recordFailedLoginAttempt(lockedUserId, { userRepo, auditRepo });
  });

  describe('Step 051.1 & Authorization: Staff Role & Step-Up Reauthentication Enforcement', () => {
    it('rejects unlock request from unauthorized staff role (e.g. merchant_viewer or support)', async () => {
      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');

      const result = await unlockUserAccountByOffice(
        {
          targetUserId: lockedUserId,
          staffActorId,
          staffRole: 'merchant_viewer',
          contactConfirmed: true,
          reason: 'Verified direct email contact with account owner.',
          ticketId: ticket.id,
        },
        { userRepo, auditRepo }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('FORBIDDEN');
      expect(result.message).toContain('Only compliance_kyc staff or super_admin');
    });

    it('requires valid step-up ticket for UNLOCK_USER_ACCOUNT action', async () => {
      // 1. Missing ticket triggers step-up challenge
      const noTicketResult = await unlockUserAccountByOffice(
        {
          targetUserId: lockedUserId,
          staffActorId,
          staffRole: 'compliance_kyc',
          contactConfirmed: true,
          reason: 'Verified direct email contact with account owner.',
        },
        { userRepo, auditRepo }
      );

      expect(noTicketResult.success).toBe(false);
      expect(noTicketResult.error).toBe('STEP_UP_REQUIRED');
      expect(noTicketResult.challengeRequired).toBe(true);

      // 2. Mismatched ticket action is rejected
      const payoutTicket = issueStepUpTicket(staffActorId, 'FREEZE_PAYOUTS');
      const mismatchedResult = await unlockUserAccountByOffice(
        {
          targetUserId: lockedUserId,
          staffActorId,
          staffRole: 'compliance_kyc',
          contactConfirmed: true,
          reason: 'Verified direct email contact with account owner.',
          ticketId: payoutTicket.id,
        },
        { userRepo, auditRepo }
      );

      expect(mismatchedResult.success).toBe(false);
      expect(mismatchedResult.error).toBe('STEP_UP_REQUIRED');
    });

    it('permits authorized compliance_kyc or super_admin with valid step-up ticket', async () => {
      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');

      const result = await unlockUserAccountByOffice(
        {
          targetUserId: lockedUserId,
          staffActorId,
          staffRole: 'compliance_kyc',
          contactConfirmed: true,
          reason: 'Direct phone call and email confirmation verified with Ludovico.',
          ticketId: ticket.id,
        },
        { userRepo, auditRepo }
      );

      expect(result.success).toBe(true);
      expect(result.userId).toBe(lockedUserId);
      expect(result.message).toContain('unlocked successfully');
    });
  });

  describe('Step 051.2: Mandatory Contact Confirmation Checkbox & Justification Reason', () => {
    it('rejects unlock when contact confirmation checkbox is false or missing', async () => {
      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');

      const result = await unlockUserAccountByOffice(
        {
          targetUserId: lockedUserId,
          staffActorId,
          staffRole: 'compliance_kyc',
          contactConfirmed: false, // Mandatory confirmation not checked
          reason: 'Verified direct contact with owner.',
          ticketId: ticket.id,
        },
        { userRepo, auditRepo }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('CONTACT_NOT_CONFIRMED');
      expect(result.message).toContain(MANDATORY_CONTACT_CONFIRMATION_STATEMENT);
    });

    it('rejects unlock when reason is missing or less than 10 characters', async () => {
      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');

      const result = await unlockUserAccountByOffice(
        {
          targetUserId: lockedUserId,
          staffActorId,
          staffRole: 'compliance_kyc',
          contactConfirmed: true,
          reason: 'too short',
          ticketId: ticket.id,
        },
        { userRepo, auditRepo }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_REASON');
      expect(result.message).toContain('minimum 10 characters');
    });
  });

  describe('Step 051.3 & Step 051.4: Database Reset & Audit Trail Verification', () => {
    it('resets failed_attempts to 0 and clears locked_until to NULL in database', async () => {
      const preUnlockUser = await userRepo.findById(lockedUserId);
      expect(preUnlockUser?.status).toBe('locked');
      expect(preUnlockUser?.failed_attempts).toBe(2);
      expect(preUnlockUser?.locked_until).not.toBeNull();

      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');
      const result = await unlockUserAccountByOffice(
        {
          targetUserId: lockedUserId,
          staffActorId,
          staffRole: 'super_admin',
          isSuperadmin: true,
          contactConfirmed: true,
          reason: 'Account owner verified via secondary verified phone and corporate email.',
          ticketId: ticket.id,
        },
        { userRepo, auditRepo }
      );

      expect(result.success).toBe(true);

      // Verify database state reset
      const postUnlockUser = await userRepo.findById(lockedUserId);
      expect(postUnlockUser?.status).toBe('active');
      expect(postUnlockUser?.failed_attempts).toBe(0);
      expect(postUnlockUser?.locked_until).toBeNull();
    });

    it('writes USER_UNLOCKED_BY_OFFICE entry to audit_logs capturing staff actorId, target userId, and reason', async () => {
      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');
      const unlockReason = 'Compliance officer verified video call and security question confirmation.';

      await unlockUserAccountByOffice(
        {
          targetUserId: lockedUserId,
          staffActorId,
          staffRole: 'compliance_kyc',
          contactConfirmed: true,
          reason: unlockReason,
          ticketId: ticket.id,
        },
        { userRepo, auditRepo }
      );

      const auditEntries = await auditRepo.findMany();
      const unlockAudit = auditEntries.find(
        (e) => e.action === 'USER_UNLOCKED_BY_OFFICE' && e.entity_id === lockedUserId
      );

      expect(unlockAudit).toBeDefined();
      expect(unlockAudit?.actor_id).toBe(staffActorId);
      expect(unlockAudit?.payload.targetUserId).toBe(lockedUserId);
      expect(unlockAudit?.payload.staffRole).toBe('compliance_kyc');
      expect(unlockAudit?.payload.reason).toBe(unlockReason);
      expect(unlockAudit?.payload.confirmationStatement).toBe(MANDATORY_CONTACT_CONFIRMATION_STATEMENT);

      // Verify diff payload
      expect(unlockAudit?.diff_payload?.before?.status).toBe('locked');
      expect(unlockAudit?.diff_payload?.after?.status).toBe('active');
      expect(unlockAudit?.diff_payload?.after?.failed_attempts).toBe(0);
      expect(unlockAudit?.diff_payload?.after?.locked_until).toBeNull();
    });

    it('rejects unlock if target user is not currently in a locked state', async () => {
      // Create unlocked active user
      const activeUser = await userRepo.createUser({
        email: `active.${Date.now()}@kdsolution.it`,
        full_legal_name: 'Ennio Morricone',
        password_hash: await hashPassword(testPassword),
        status: 'active',
        is_staff: false,
        failed_attempts: 0,
        locked_until: null,
      });

      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');
      const result = await unlockUserAccountByOffice(
        {
          targetUserId: activeUser.id,
          staffActorId,
          staffRole: 'compliance_kyc',
          contactConfirmed: true,
          reason: 'Attempting unlock on non-locked user.',
          ticketId: ticket.id,
        },
        { userRepo, auditRepo }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('USER_NOT_LOCKED');
      expect(result.message).toContain('not currently in a locked state');
    });
  });

  describe('Step 051.1 & Quality Gate: API Endpoint POST /api/office/users/[id]/unlock & Instant Login', () => {
    it('returns 428 Precondition Required if step-up ticket is missing via HTTP POST', async () => {
      const req = new Request(
        `http://localhost:3000/api/office/users/${lockedUserId}/unlock`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-staff-id': staffActorId,
            'x-staff-role': 'compliance_kyc',
          },
          body: JSON.stringify({
            contact_confirmed: true,
            reason: 'Verified direct email contact with account owner.',
          }),
        }
      );

      const res = await POST(req, { params: { id: lockedUserId } }, { userRepo, auditRepo });
      expect(res.status).toBe(428);

      const json = await res.json();
      expect(json.title).toBe('Step-Up Reauthentication Required');
    });

    it('returns 400 Bad Request if contact confirmation checkbox is omitted via HTTP POST', async () => {
      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');
      const req = new Request(
        `http://localhost:3000/api/office/users/${lockedUserId}/unlock`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-staff-id': staffActorId,
            'x-staff-role': 'compliance_kyc',
            'x-step-up-ticket': ticket.id,
          },
          body: JSON.stringify({
            contact_confirmed: false,
            reason: 'Verified direct email contact with account owner.',
          }),
        }
      );

      const res = await POST(req, { params: { id: lockedUserId } }, { userRepo, auditRepo });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.title).toBe('Mandatory Contact Confirmation Required');
    });

    it('Quality Gate: Unlocks account via office API, records audit trail, and user can immediately log in', async () => {
      // 1. Confirm user is locked and login is initially rejected
      const preLogin = await authenticateUser(
        {
          email: lockedUserEmail,
          password: testPassword,
          device: testDevice,
        },
        { userRepo, auditRepo }
      );
      expect(preLogin.success).toBe(false);
      expect(preLogin.error).toBe('ACCOUNT_LOCKED');

      // 2. Office staff issues step-up ticket and submits unlock
      const ticket = issueStepUpTicket(staffActorId, 'UNLOCK_USER_ACCOUNT');
      const req = new Request(
        `http://localhost:3000/api/office/users/${lockedUserId}/unlock`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-staff-id': staffActorId,
            'x-staff-role': 'compliance_kyc',
            'x-step-up-ticket': ticket.id,
          },
          body: JSON.stringify({
            contact_confirmed: true,
            reason: 'Direct contact with account owner confirmed via verified email domain.',
          }),
        }
      );

      const unlockRes = await POST(
        req,
        { params: { id: lockedUserId } },
        { userRepo, auditRepo }
      );
      expect(unlockRes.status).toBe(200);

      const unlockJson = await unlockRes.json();
      expect(unlockJson.success).toBe(true);
      expect(unlockJson.user_id).toBe(lockedUserId);
      expect(unlockJson.confirmation_statement).toBe(MANDATORY_CONTACT_CONFIRMATION_STATEMENT);

      // 3. User can log in immediately with correct password
      const postLogin = await authenticateUser(
        {
          email: lockedUserEmail,
          password: testPassword,
          device: testDevice,
        },
        { userRepo, auditRepo }
      );

      expect(postLogin.success).toBe(true);
      expect(postLogin.session).toBeDefined();
      expect(postLogin.sessionToken).toBeDefined();
      expect(postLogin.user?.status).toBe('active');
      expect(postLogin.user?.failed_attempts).toBe(0);

      // 4. Verify audit log captures USER_UNLOCKED_BY_OFFICE
      const auditEntries = await auditRepo.findMany();
      const unlockEntry = auditEntries.find(
        (e) => e.action === 'USER_UNLOCKED_BY_OFFICE' && e.entity_id === lockedUserId
      );
      expect(unlockEntry).toBeDefined();
      expect(unlockEntry?.actor_id).toBe(staffActorId);
    });
  });
});
