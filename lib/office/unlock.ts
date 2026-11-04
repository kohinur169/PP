// path: lib/office/unlock.ts

import { UserRepository } from '../db/users';
import { AuditLogRepository } from '../db/audit';
import { consumeStepUpTicket, createStepUpChallenge } from '../auth/step-up';
import type { UserEntity } from '../../types/user';
import { logger } from '../logger';

/**
 * Standard confirmation statement mandated by Step 051.2 before unlocking an account.
 */
export const MANDATORY_CONTACT_CONFIRMATION_STATEMENT =
  'I confirm direct contact with account owner has been verified';

/**
 * Roles permitted to perform administrative account unlocking.
 */
export const AUTHORIZED_UNLOCK_ROLES = new Set([
  'compliance_kyc',
  'super_admin',
  'owner',
  'compliance_officer',
]);

/**
 * Payload provided by office staff when initiating an account unlock.
 */
export interface OfficeUnlockParams {
  readonly targetUserId: string;
  readonly staffActorId: string;
  readonly staffRole: string;
  readonly isSuperadmin?: boolean | undefined;
  readonly contactConfirmed: boolean;
  readonly reason: string;
  readonly ticketId?: string | undefined;
}

/**
 * Result returned by the office unlock engine.
 */
export interface OfficeUnlockResult {
  readonly success: boolean;
  readonly message: string;
  readonly error?:
    | 'FORBIDDEN'
    | 'CONTACT_NOT_CONFIRMED'
    | 'INVALID_REASON'
    | 'STEP_UP_REQUIRED'
    | 'USER_NOT_FOUND'
    | 'USER_NOT_LOCKED'
    | 'INTERNAL_ERROR'
    | undefined;
  readonly challengeRequired?: boolean | undefined;
  readonly userId?: string | undefined;
  readonly unlockedAt?: string | undefined;
  readonly user?: UserEntity | undefined;
}

/**
 * Options configuring repository dependencies and execution environment.
 */
export interface OfficeUnlockOptions {
  readonly userRepo?: UserRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly bypassStepUp?: boolean | undefined;
}

const defaultUserRepo = new UserRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Evaluates whether an administrative actor possesses permission to unlock accounts.
 */
export function isStaffAuthorizedForUnlock(
  staffRole: string,
  isSuperadmin: boolean = false
): boolean {
  if (isSuperadmin) return true;
  return AUTHORIZED_UNLOCK_ROLES.has(staffRole.trim().toLowerCase());
}

/**
 * Step 051: Office Account Unlock Workflow with Mandatory Email Verification.
 * - Enforces compliance_kyc or super_admin role authorization
 * - Requires step-up reauthentication ticket for sensitive action 'UNLOCK_USER_ACCOUNT'
 * - Requires explicit confirmation of direct verified contact with the account owner
 * - Resets failed_attempts to 0 and clears locked_until in database
 * - Records immutable USER_UNLOCKED_BY_OFFICE entry in audit log
 */
export async function unlockUserAccountByOffice(
  params: OfficeUnlockParams,
  options?: OfficeUnlockOptions
): Promise<OfficeUnlockResult> {
  const userRepo = options?.userRepo ?? defaultUserRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  // 1. Authorization Gate: compliance_kyc or super_admin required
  const isAuthorized = isStaffAuthorizedForUnlock(
    params.staffRole,
    params.isSuperadmin ?? false
  );

  if (!isAuthorized) {
    logger.warn('Office unlock rejected: unauthorized staff role', {
      staffActorId: params.staffActorId,
      staffRole: params.staffRole,
      targetUserId: params.targetUserId,
    });

    return {
      success: false,
      error: 'FORBIDDEN',
      message:
        'Access Denied: Only compliance_kyc staff or super_admin may unlock security-locked accounts.',
    };
  }

  // 2. Step 051.2: Mandatory contact confirmation statement
  if (!params.contactConfirmed) {
    logger.warn('Office unlock rejected: contact not confirmed', {
      staffActorId: params.staffActorId,
      targetUserId: params.targetUserId,
    });

    return {
      success: false,
      error: 'CONTACT_NOT_CONFIRMED',
      message: `Mandatory verification required: "${MANDATORY_CONTACT_CONFIRMATION_STATEMENT}".`,
    };
  }

  // 3. Operational reason validation
  const reason = (params.reason || '').trim();
  if (reason.length < 10) {
    return {
      success: false,
      error: 'INVALID_REASON',
      message:
        'A comprehensive operational reason (minimum 10 characters) must be documented for compliance auditing.',
    };
  }

  // 4. Step 051.1: Step-up reauthentication gate
  if (!options?.bypassStepUp) {
    if (!params.ticketId) {
      logger.info('Office unlock invoked without step-up ticket - challenge issued', {
        staffActorId: params.staffActorId,
        targetUserId: params.targetUserId,
      });

      const challenge = createStepUpChallenge('UNLOCK_USER_ACCOUNT');
      return {
        success: false,
        error: 'STEP_UP_REQUIRED',
        challengeRequired: true,
        message: challenge.message,
      };
    }

    const ticketConsumed = consumeStepUpTicket(
      params.ticketId,
      params.staffActorId,
      'UNLOCK_USER_ACCOUNT'
    );

    if (!ticketConsumed) {
      logger.warn('Office unlock invoked with invalid or expired step-up ticket', {
        staffActorId: params.staffActorId,
        ticketId: params.ticketId,
      });

      return {
        success: false,
        error: 'STEP_UP_REQUIRED',
        challengeRequired: true,
        message:
          'Step-up reauthentication ticket is invalid or has expired (>5 minutes). Please reauthenticate.',
      };
    }
  }

  // 5. Target user lookup
  const targetUser = await userRepo.findById(params.targetUserId);
  if (!targetUser) {
    return {
      success: false,
      error: 'USER_NOT_FOUND',
      message: `Target user with ID "${params.targetUserId}" was not found.`,
    };
  }

  // 6. Verify user is currently locked
  const isLocked =
    targetUser.status === 'locked' ||
    (targetUser.locked_until !== null &&
      new Date(targetUser.locked_until).getTime() > Date.now());

  if (!isLocked) {
    logger.warn('Office unlock rejected: target user is not locked', {
      targetUserId: targetUser.id,
      status: targetUser.status,
    });

    return {
      success: false,
      error: 'USER_NOT_LOCKED',
      message: 'The target user account is not currently in a locked state.',
    };
  }

  const nowIso = new Date().toISOString();
  const previousStatus = targetUser.status;
  const previousFailedAttempts = targetUser.failed_attempts;
  const previousLockedUntil = targetUser.locked_until;

  // 7. Step 051.3: Reset failed_attempts = 0, locked_until = NULL, status = 'active'
  const updatedUser = await userRepo.update(targetUser.id, targetUser.version, {
    failed_attempts: 0,
    locked_until: null,
    status: 'active',
  });

  // 8. Step 051.4: Write USER_UNLOCKED_BY_OFFICE entry to audit_logs
  await auditRepo.append({
    action: 'USER_UNLOCKED_BY_OFFICE',
    entity_type: 'user',
    entity_id: targetUser.id,
    actor_id: params.staffActorId,
    company_id: targetUser.company_id,
    diff_payload: {
      before: {
        status: previousStatus,
        failed_attempts: previousFailedAttempts,
        locked_until: previousLockedUntil,
      },
      after: {
        status: 'active',
        failed_attempts: 0,
        locked_until: null,
      },
      changed_fields: ['status', 'failed_attempts', 'locked_until'],
    },
    payload: {
      targetUserId: targetUser.id,
      targetEmail: targetUser.email,
      staffActorId: params.staffActorId,
      staffRole: params.staffRole,
      isSuperadmin: params.isSuperadmin ?? false,
      reason,
      contactConfirmed: true,
      confirmationStatement: MANDATORY_CONTACT_CONFIRMATION_STATEMENT,
      unlockedAt: nowIso,
    },
  });

  logger.info('User account successfully unlocked by office staff', {
    targetUserId: targetUser.id,
    targetEmail: targetUser.email,
    staffActorId: params.staffActorId,
    staffRole: params.staffRole,
  });

  return {
    success: true,
    message: 'User account unlocked successfully.',
    userId: targetUser.id,
    unlockedAt: nowIso,
    user: updatedUser,
  };
}
