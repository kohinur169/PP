// path: tests/office/2fa-reset.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  submitOffice2faResetRequest,
  approveOffice2faReset,
  rejectOffice2faReset,
  isStaffAuthorizedFor2faReset,
} from '@/lib/office/2fa-reset';
import { UserRepository } from '@/lib/db/users';
import { UserMfaRepository } from '@/lib/db/mfa';
import { UserBackupCodesRepository } from '@/lib/db/backup-codes';
import { Office2faResetRepository } from '@/lib/db/office-2fa';
import { AuditLogRepository } from '@/lib/db/audit';
import { issueStepUpTicket } from '@/lib/auth/step-up';
import { evaluate2faRedirect } from '@/lib/auth/totp';
import { POST as approveApiRoute } from '@/app/api/office/2fa-reset/[id]/approve/route';

describe('Step 054: Office 2FA Reset Workflow for Lost Credentials', () => {
  let userRepo: UserRepository;
  let mfaRepo: UserMfaRepository;
  let backupRepo: UserBackupCodesRepository;
  let resetRepo: Office2faResetRepository;
  let auditRepo: AuditLogRepository;

  const testUserId = '01a1a63a-2000-7000-8000-111122223333';
  const testStaffId = '01a1a63a-3000-7000-8000-444455556666';

  beforeEach(async () => {
    userRepo = new UserRepository();
    mfaRepo = new UserMfaRepository();
    backupRepo = new UserBackupCodesRepository();
    resetRepo = new Office2faResetRepository();
    auditRepo = new AuditLogRepository();

    // Create active merchant user with existing 2FA and backup codes
    await userRepo.createUser({
      id: testUserId,
      email: 'lost.credentials@kdsolution.it',
      full_legal_name: 'Merchant With Lost Credentials',
      password_hash: 'argon2id$mocked$hash',
      status: 'active',
      failed_attempts: 0,
      locked_until: null,
      is_staff: false,
      must_setup_2fa: false,
    });

    // Populate active 2FA
    await mfaRepo.upsertEnrollment(testUserId, 'v1:encrypted:secret');
    await mfaRepo.enableMfa(testUserId, 100);

    // Populate active backup codes
    await backupRepo.storeHashedCodes(testUserId, [
      'hash_code_1',
      'hash_code_2',
      'hash_code_3',
    ]);
  });

  describe('Step 054.1: SQL Migration & Request Submission', () => {
    it('migration file defines office_2fa_reset_requests and must_setup_2fa column', () => {
      const sqlPath = path.resolve(process.cwd(), 'db/migrations/015_office_2fa_resets.sql');
      expect(fs.existsSync(sqlPath)).toBe(true);

      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      expect(sqlContent).toContain('CREATE TABLE IF NOT EXISTS public.office_2fa_reset_requests');
      expect(sqlContent).toContain('ticket_id varchar(100) NOT NULL');
      expect(sqlContent).toContain('verification_docs jsonb NOT NULL');
      expect(sqlContent).toContain('reviewed_by uuid NULL');
      expect(sqlContent).toContain('status varchar(50) NOT NULL');
      expect(sqlContent).toContain('ADD COLUMN IF NOT EXISTS must_setup_2fa boolean');
    });

    it('submits a formal 2FA reset request with ticket ID and verification documents', async () => {
      const result = await submitOffice2faResetRequest(
        {
          userId: testUserId,
          ticketId: 'KD-SUP-8921',
          verificationDocs: ['doc_passport_scan.pdf', 'doc_trade_license.pdf'],
        },
        { userRepo, resetRepo, auditRepo }
      );

      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();
      expect(result.request!.status).toBe('pending');
      expect(result.request!.ticket_id).toBe('KD-SUP-8921');
      expect(result.request!.verification_docs.length).toBe(2);

      const pending = await resetRepo.findPendingRequests();
      expect(pending.length).toBe(1);
    });

    it('rejects request submission without ticket ID or verification documents', async () => {
      const noTicket = await submitOffice2faResetRequest(
        {
          userId: testUserId,
          ticketId: '',
          verificationDocs: ['doc.pdf'],
        },
        { userRepo, resetRepo, auditRepo }
      );
      expect(noTicket.success).toBe(false);
      expect(noTicket.error).toBe('INVALID_PARAMS');

      const noDocs = await submitOffice2faResetRequest(
        {
          userId: testUserId,
          ticketId: 'KD-SUP-1234',
          verificationDocs: [],
        },
        { userRepo, resetRepo, auditRepo }
      );
      expect(noDocs.success).toBe(false);
      expect(noDocs.error).toBe('INVALID_PARAMS');
    });
  });

  describe('Step 054.2 & Step 054.4: Staff Authorization, Step-Up & Approval', () => {
    it('verifies staff role authorization for 2FA resets', () => {
      expect(isStaffAuthorizedFor2faReset('compliance_kyc')).toBe(true);
      expect(isStaffAuthorizedFor2faReset('super_admin')).toBe(true);
      expect(isStaffAuthorizedFor2faReset('compliance_officer')).toBe(true);
      expect(isStaffAuthorizedFor2faReset('merchant_viewer')).toBe(false);
      expect(isStaffAuthorizedFor2faReset('support')).toBe(false);
      expect(isStaffAuthorizedFor2faReset('developer')).toBe(false);
      expect(isStaffAuthorizedFor2faReset('any_role', true)).toBe(true); // Superadmin override
    });

    it('requires step-up reauthentication ticket for RESET_USER_2FA sensitive action', async () => {
      const submitRes = await submitOffice2faResetRequest(
        {
          userId: testUserId,
          ticketId: 'KD-SUP-7711',
          verificationDocs: ['doc_id.pdf'],
        },
        { userRepo, resetRepo, auditRepo }
      );

      // Attempt approval without step-up ticket
      const resultNoTicket = await approveOffice2faReset(
        {
          requestId: submitRes.request!.id,
          staffActorId: testStaffId,
          staffRole: 'compliance_kyc',
        },
        { userRepo, mfaRepo, backupRepo, resetRepo, auditRepo }
      );

      expect(resultNoTicket.success).toBe(false);
      expect(resultNoTicket.error).toBe('STEP_UP_REQUIRED');
      expect(resultNoTicket.challengeRequired).toBe(true);
    });

    it('clears existing TOTP secret, clears backup codes, sets must_setup_2fa, and audit logs', async () => {
      const submitRes = await submitOffice2faResetRequest(
        {
          userId: testUserId,
          ticketId: 'KD-SUP-7711',
          verificationDocs: ['doc_passport.pdf', 'doc_utility_bill.pdf'],
        },
        { userRepo, resetRepo, auditRepo }
      );

      // Issue valid step-up ticket for RESET_USER_2FA
      const ticket = issueStepUpTicket(testStaffId, 'RESET_USER_2FA');

      // Execute approval
      const approvalResult = await approveOffice2faReset(
        {
          requestId: submitRes.request!.id,
          staffActorId: testStaffId,
          staffRole: 'compliance_kyc',
          ticketId: ticket.id,
          notes: 'Merchant video interview & passport verification completed.',
        },
        { userRepo, mfaRepo, backupRepo, resetRepo, auditRepo }
      );

      expect(approvalResult.success).toBe(true);

      // 1. Existing TOTP secret is cleared (mfa_enabled = false)
      const mfaRecord = await mfaRepo.findByUserId(testUserId);
      expect(mfaRecord!.mfa_enabled).toBe(false);

      // 2. Existing backup recovery codes are completely invalidated
      const activeBackupCount = await backupRepo.countActiveForUser(testUserId);
      expect(activeBackupCount).toBe(0);

      // 3. User record has must_setup_2fa set to true
      const updatedUser = await userRepo.findById(testUserId);
      expect(updatedUser!.must_setup_2fa).toBe(true);

      // 4. Request status updated to approved
      const updatedReq = await resetRepo.findById(submitRes.request!.id);
      expect(updatedReq!.status).toBe('approved');
      expect(updatedReq!.reviewed_by).toBe(testStaffId);
      expect(updatedReq!.approved_at).not.toBeNull();

      // 5. Immutable 2FA_RESET_BY_OFFICE audit event logged
      const audits = await auditRepo.findMany();
      const resetAudit = audits.find((a) => a.action === '2FA_RESET_BY_OFFICE');
      expect(resetAudit).toBeDefined();
      expect(resetAudit!.actor_id).toBe(testStaffId);
      expect(resetAudit!.entity_id).toBe(testUserId);
      expect(resetAudit!.diff_payload?.after).toEqual({
        mfa_enabled: false,
        must_setup_2fa: true,
      });
      expect(resetAudit!.payload).toHaveProperty('verificationDocs');
    });

    it('allows compliance staff to reject invalid reset requests with reason', async () => {
      const submitRes = await submitOffice2faResetRequest(
        {
          userId: testUserId,
          ticketId: 'KD-SUP-9900',
          verificationDocs: ['fake_doc.png'],
        },
        { userRepo, resetRepo, auditRepo }
      );

      const rejectResult = await rejectOffice2faReset(
        {
          requestId: submitRes.request!.id,
          staffActorId: testStaffId,
          staffRole: 'compliance_kyc',
          reason: 'Document signature does not match records.',
        },
        { resetRepo, auditRepo }
      );

      expect(rejectResult.success).toBe(true);
      const req = await resetRepo.findById(submitRes.request!.id);
      expect(req!.status).toBe('rejected');
      expect(req!.rejection_reason).toBe('Document signature does not match records.');
    });

    it('API route POST /api/office/2fa-reset/[id]/approve executes approval with step-up header', async () => {
      const submitRes = await submitOffice2faResetRequest(
        {
          userId: testUserId,
          ticketId: 'KD-SUP-API-TEST',
          verificationDocs: ['doc_gov_id.pdf'],
        },
        { userRepo, resetRepo, auditRepo }
      );

      const ticket = issueStepUpTicket(testStaffId, 'RESET_USER_2FA');

      const req = new Request(
        `http://localhost:3000/api/office/2fa-reset/${submitRes.request!.id}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-staff-id': testStaffId,
            'x-staff-role': 'compliance_kyc',
            'x-step-up-ticket': ticket.id,
          },
          body: JSON.stringify({ notes: 'Verified over phone & email' }),
        }
      );

      const res = await approveApiRoute(
        req,
        { params: { id: submitRes.request!.id } },
        { userRepo, mfaRepo, backupRepo, resetRepo, auditRepo }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.must_setup_2fa).toBe(true);
    });
  });

  describe('Quality Gate: Immediate Mandatory 2FA Setup on Next Sign-In', () => {
    it('allows user to authenticate with password and forces immediate redirect to /auth/2fa/setup', async () => {
      // 1. Submit reset request
      const submitRes = await submitOffice2faResetRequest(
        {
          userId: testUserId,
          ticketId: 'KD-SUP-E2E-GATE',
          verificationDocs: ['official_passport.pdf'],
        },
        { userRepo, resetRepo, auditRepo }
      );

      // 2. Office staff approves with step-up ticket
      const ticket = issueStepUpTicket(testStaffId, 'RESET_USER_2FA');
      await approveOffice2faReset(
        {
          requestId: submitRes.request!.id,
          staffActorId: testStaffId,
          staffRole: 'super_admin',
          ticketId: ticket.id,
        },
        { userRepo, mfaRepo, backupRepo, resetRepo, auditRepo }
      );

      // 3. User attempts to sign in with password -> user has must_setup_2fa: true and mfa_enabled: false
      const user = await userRepo.findById(testUserId);
      expect(user!.must_setup_2fa).toBe(true);

      const mfaState = await mfaRepo.findByUserId(testUserId);
      expect(mfaState!.mfa_enabled).toBe(false);

      // 4. User navigates toward protected dashboard
      const redirectDecision = evaluate2faRedirect(
        {
          id: user!.id,
          mfa_enabled: mfaState!.mfa_enabled,
          status: user!.status,
        },
        '/dashboard'
      );

      // 5. Must redirect immediately to mandatory 2FA enrollment page
      expect(redirectDecision.shouldRedirect).toBe(true);
      expect(redirectDecision.destination).toBe('/auth/2fa/setup');
    });
  });
});
