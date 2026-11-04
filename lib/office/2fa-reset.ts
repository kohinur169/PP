// path: lib/office/2fa-reset.ts

import { UserRepository } from '../db/users';
import { UserMfaRepository } from '../db/mfa';
import { UserBackupCodesRepository } from '../db/backup-codes';
import { Office2faResetRepository } from '../db/office-2fa';
import { AuditLogRepository } from '../db/audit';
import { consumeStepUpTicket, createStepUpChallenge } from '../auth/step-up';
import type { Office2faResetRequestEntity } from '../../types/office-2fa';
import type { UserEntity } from '../../types/user';
import { logger } from '../logger';

export const AUTHORIZED_2FA_RESET_ROLES = new Set([
  'compliance_kyc',
  'super_admin',
  'owner',
  'compliance_officer',
]);

/**
 * Checks if staff role is authorized to perform administrative 2FA resets.
 */
export function isStaffAuthorizedFor2faReset(
  role: string,
  isSuperadmin: boolean = false
): boolean {
  if (isSuperadmin) return true;
  return AUTHORIZED_2FA_RESET_ROLES.has(role.trim().toLowerCase());
}

export interface Submit2faResetParams {
  readonly userId: string;
  readonly ticketId: string;
  readonly verificationDocs: string[];
  readonly companyId?: string | undefined;
}

export interface Approve2faResetParams {
  readonly requestId: string;
  readonly staffActorId: string;
  readonly staffRole: string;
  readonly isSuperadmin?: boolean | undefined;
  readonly ticketId?: string | undefined; // Step-up ticket ID
  readonly notes?: string | undefined;
}

export interface Reject2faResetParams {
  readonly requestId: string;
  readonly staffActorId: string;
  readonly staffRole: string;
  readonly isSuperadmin?: boolean | undefined;
  readonly reason: string;
}

export interface Office2faResetResult {
  readonly success: boolean;
  readonly message: string;
  readonly error?:
    | 'FORBIDDEN'
    | 'REQUEST_NOT_FOUND'
    | 'REQUEST_NOT_PENDING'
    | 'STEP_UP_REQUIRED'
    | 'USER_NOT_FOUND'
    | 'INVALID_PARAMS'
    | 'INTERNAL_ERROR'
    | undefined;
  readonly challengeRequired?: boolean | undefined;
  readonly request?: Office2faResetRequestEntity | undefined;
  readonly user?: UserEntity | undefined;
}

export interface Office2faResetOptions {
  readonly userRepo?: UserRepository | undefined;
  readonly mfaRepo?: UserMfaRepository | undefined;
  readonly backupRepo?: UserBackupCodesRepository | undefined;
  readonly resetRepo?: Office2faResetRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly bypassStepUp?: boolean | undefined;
}

const defaultUserRepo = new UserRepository();
const defaultMfaRepo = new UserMfaRepository();
const defaultBackupRepo = new UserBackupCodesRepository();
const defaultResetRepo = new Office2faResetRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Step 054.1: Submits a formal office 2FA reset request with support ticket ID
 * and verification documents submitted by merchant via email.
 */
export async function submitOffice2faResetRequest(
  params: Submit2faResetParams,
  options?: Office2faResetOptions
): Promise<Office2faResetResult> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const resetRepo = options?.resetRepo ?? defaultResetRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const ticketId = (params.ticketId || '').trim();
  if (!ticketId) {
    return {
      success: false,
      error: 'INVALID_PARAMS',
      message: 'A valid email support ticket ID is required.',
    };
  }

  if (!params.verificationDocs || params.verificationDocs.length === 0) {
    return {
      success: false,
      error: 'INVALID_PARAMS',
      message: 'At least one identity verification document reference must be provided.',
    };
  }

  const user = await userRepo.findById(params.userId);
  if (!user) {
    return {
      success: false,
      error: 'USER_NOT_FOUND',
      message: `User with ID "${params.userId}" not found.`,
    };
  }

  const createdRequest = await resetRepo.createRequest({
    user_id: user.id,
    ticket_id: ticketId,
    verification_docs: params.verificationDocs,
    company_id: params.companyId ?? user.company_id,
  });

  await auditRepo.append({
    action: '2FA_RESET_REQUESTED',
    entity_type: 'user',
    entity_id: user.id,
    actor_id: user.id,
    payload: {
      requestId: createdRequest.id,
      ticketId,
      verificationDocsCount: params.verificationDocs.length,
      requestedAt: new Date().toISOString(),
    },
  });

  logger.info('Office 2FA reset request logged for user', {
    userId: user.id,
    ticketId,
    requestId: createdRequest.id,
  });

  return {
    success: true,
    message: '2FA reset request submitted for compliance verification.',
    request: createdRequest,
  };
}

/**
 * Step 054.2, 054.3 & 054.4: Executes office approval of 2FA reset:
 * - Requires compliance_kyc or super_admin role
 * - Enforces step-up reauthentication for 'RESET_USER_2FA'
 * - Clears existing TOTP secret and backup recovery codes
 * - Sets must_setup_2fa = true on user record
 * - Logs 2FA_RESET_BY_OFFICE in audit log with reviewer ID and verification docs
 */
export async function approveOffice2faReset(
  params: Approve2faResetParams,
  options?: Office2faResetOptions
): Promise<Office2faResetResult> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const mfaRepo = options?.mfaRepo ?? defaultMfaRepo;
  const backupRepo = options?.backupRepo ?? defaultBackupRepo;
  const resetRepo = options?.resetRepo ?? defaultResetRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  // 1. Authorization check
  const isAuthorized = isStaffAuthorizedFor2faReset(
    params.staffRole,
    params.isSuperadmin ?? false
  );

  if (!isAuthorized) {
    logger.warn('Office 2FA reset approval rejected: unauthorized staff role', {
      staffActorId: params.staffActorId,
      staffRole: params.staffRole,
    });
    return {
      success: false,
      error: 'FORBIDDEN',
      message:
        'Access Denied: Only compliance staff or super_admin may authorize 2FA credential resets.',
    };
  }

  // 2. Step-up reauthentication gate
  if (!options?.bypassStepUp) {
    if (!params.ticketId) {
      const challenge = createStepUpChallenge('RESET_USER_2FA');
      return {
        success: false,
        error: 'STEP_UP_REQUIRED',
        challengeRequired: true,
        message: challenge.message,
      };
    }

    const ticketValid = consumeStepUpTicket(
      params.ticketId,
      params.staffActorId,
      'RESET_USER_2FA'
    );

    if (!ticketValid) {
      return {
        success: false,
        error: 'STEP_UP_REQUIRED',
        challengeRequired: true,
        message:
          'Step-up reauthentication ticket is invalid or expired (>5 minutes). Please reauthenticate.',
      };
    }
  }

  // 3. Find reset request
  const resetRequest = await resetRepo.findById(params.requestId);
  if (!resetRequest) {
    return {
      success: false,
      error: 'REQUEST_NOT_FOUND',
      message: `2FA reset request with ID "${params.requestId}" not found.`,
    };
  }

  if (resetRequest.status !== 'pending') {
    return {
      success: false,
      error: 'REQUEST_NOT_PENDING',
      message: `Cannot approve request with current status "${resetRequest.status}".`,
    };
  }

  // 4. Find user
  const user = await userRepo.findById(resetRequest.user_id);
  if (!user) {
    return {
      success: false,
      error: 'USER_NOT_FOUND',
      message: `Target user with ID "${resetRequest.user_id}" not found.`,
    };
  }

  // 5. Step 054.2: Clear existing TOTP secret in user_mfa
  const mfaRecord = await mfaRepo.findByUserId(user.id);
  if (mfaRecord) {
    await mfaRepo.disableMfa(user.id);
  }

  // Step 054.2: Invalidate all existing backup recovery codes
  await backupRepo.invalidateAllForUser(user.id);

  // 6. Step 054.3: Flag user record with must_setup_2fa = true
  const updatedUser = await userRepo.update(user.id, user.version, {
    must_setup_2fa: true,
  });

  // 7. Update reset request record
  const updatedRequest = await resetRepo.approveRequest(
    resetRequest.id,
    params.staffActorId,
    resetRequest.version
  );

  const nowIso = new Date().toISOString();

  // 8. Step 054.4: Log 2FA_RESET_BY_OFFICE in audit_logs
  await auditRepo.append({
    action: '2FA_RESET_BY_OFFICE',
    entity_type: 'user',
    entity_id: user.id,
    actor_id: params.staffActorId,
    company_id: user.company_id,
    diff_payload: {
      before: {
        mfa_enabled: mfaRecord?.mfa_enabled ?? true,
        must_setup_2fa: user.must_setup_2fa ?? false,
      },
      after: {
        mfa_enabled: false,
        must_setup_2fa: true,
      },
      changed_fields: ['mfa_enabled', 'must_setup_2fa', 'backup_codes'],
    },
    payload: {
      requestId: resetRequest.id,
      ticketId: resetRequest.ticket_id,
      targetUserId: user.id,
      targetEmail: user.email,
      reviewerId: params.staffActorId,
      reviewerRole: params.staffRole,
      verificationDocs: resetRequest.verification_docs,
      notes: params.notes || null,
      approvedAt: nowIso,
    },
  });

  logger.info('2FA credentials reset by office staff for user', {
    targetUserId: user.id,
    reviewerId: params.staffActorId,
    ticketId: resetRequest.ticket_id,
  });

  return {
    success: true,
    message: 'User 2FA has been successfully reset. User is required to complete fresh 2FA setup on next sign-in.',
    request: updatedRequest,
    user: updatedUser,
  };
}

/**
 * Rejects an office 2FA reset request with documented compliance rationale.
 */
export async function rejectOffice2faReset(
  params: Reject2faResetParams,
  options?: Office2faResetOptions
): Promise<Office2faResetResult> {
  const resetRepo = options?.resetRepo ?? defaultResetRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const isAuthorized = isStaffAuthorizedFor2faReset(
    params.staffRole,
    params.isSuperadmin ?? false
  );

  if (!isAuthorized) {
    return {
      success: false,
      error: 'FORBIDDEN',
      message: 'Access Denied: Only compliance staff may reject 2FA reset requests.',
    };
  }

  const reason = (params.reason || '').trim();
  if (reason.length < 5) {
    return {
      success: false,
      error: 'INVALID_PARAMS',
      message: 'A rejection reason (minimum 5 characters) must be documented.',
    };
  }

  const resetRequest = await resetRepo.findById(params.requestId);
  if (!resetRequest) {
    return {
      success: false,
      error: 'REQUEST_NOT_FOUND',
      message: `2FA reset request with ID "${params.requestId}" not found.`,
    };
  }

  if (resetRequest.status !== 'pending') {
    return {
      success: false,
      error: 'REQUEST_NOT_PENDING',
      message: `Cannot reject request with status "${resetRequest.status}".`,
    };
  }

  const updatedRequest = await resetRepo.rejectRequest(
    resetRequest.id,
    params.staffActorId,
    reason,
    resetRequest.version
  );

  await auditRepo.append({
    action: '2FA_RESET_REJECTED',
    entity_type: 'user',
    entity_id: resetRequest.user_id,
    actor_id: params.staffActorId,
    payload: {
      requestId: resetRequest.id,
      ticketId: resetRequest.ticket_id,
      reason,
      reviewedBy: params.staffActorId,
      rejectedAt: new Date().toISOString(),
    },
  });

  logger.info('Office 2FA reset request rejected', {
    requestId: resetRequest.id,
    reviewerId: params.staffActorId,
    reason,
  });

  return {
    success: true,
    message: '2FA reset request has been rejected.',
    request: updatedRequest,
  };
}
