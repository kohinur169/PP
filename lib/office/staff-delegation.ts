// path: lib/office/staff-delegation.ts

import { z } from 'zod';
import {
  Role,
  Permission,
  assertPermission,
  isOfficeRole,
} from '@/lib/auth/roles';
import {
  consumeStepUpTicket,
  createStepUpChallenge,
} from '@/lib/auth/step-up';
import { StepUpChallenge } from '@/lib/auth/step-up-types';
import { UserRepository } from '@/lib/db/users';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

/**
 * Enterprise Office Staff Member Profile.
 */
export interface StaffMember {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: Role;
  readonly isStaff: boolean;
  readonly status: string;
  readonly twoFactorEnabled: boolean;
  readonly updatedAt: string;
}

export interface DelegateStaffRoleInput {
  readonly targetUserId: string;
  readonly newRole: Role;
  readonly reason: string;
}

export const DelegateStaffRoleSchema = z.object({
  targetUserId: z.string().uuid('Target user ID must be a valid UUID'),
  newRole: z.nativeEnum(Role),
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(500),
});

export interface DelegateStaffRoleOptions {
  readonly actorId: string;
  readonly actorRole: Role;
  readonly stepUpTicket?: string | undefined;
  readonly userRepo?: UserRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly clientIp?: string | undefined;
}

export type DelegateStaffRoleResult =
  | { readonly success: true; readonly staffMember: StaffMember; readonly oldRole: Role; readonly newRole: Role }
  | { readonly success: false; readonly challengeRequired: true; readonly challenge: StepUpChallenge };

// In-memory staff role mapping for quick test isolation and fallback
const staffRoleRegistry = new Map<string, Role>();

/**
 * Resets staff role delegation registry for test isolation.
 */
export function resetStaffRoleRegistryForTest(): void {
  staffRoleRegistry.clear();
}

/**
 * Sets explicit staff role in memory (for testing or bootstrap).
 */
export function setStaffRoleForTest(userId: string, role: Role): void {
  staffRoleRegistry.set(userId, role);
}

/**
 * Gets effective role for staff member.
 */
export function getStaffRole(userId: string, defaultRole: Role = Role.SUPPORT): Role {
  return staffRoleRegistry.get(userId) ?? defaultRole;
}

/**
 * Step 066.3 & Step 066.4: Delegates an office role to a staff member.
 * Enforces Super Admin authorization, office role constraints, and step-up 2FA reauthentication.
 */
export async function delegateStaffRole(
  input: DelegateStaffRoleInput,
  options: DelegateStaffRoleOptions
): Promise<DelegateStaffRoleResult> {
  const { actorId, actorRole, stepUpTicket, userRepo, auditRepo, clientIp } = options;

  // 1. Role Authorization Gate: Requires DELEGATE_PERMISSIONS (Super Admin)
  assertPermission(actorRole, Permission.DELEGATE_PERMISSIONS);

  // 2. Validate Target Role is an Office Role
  if (!isOfficeRole(input.newRole)) {
    throw new Error(
      `Invalid role delegation: "${input.newRole}" is not an authorized office staff role.`
    );
  }

  // 3. Schema Validation
  const validated = DelegateStaffRoleSchema.parse(input);

  // 4. Step 066.4: Enforce Step-Up 2FA Reauthentication
  if (!stepUpTicket) {
    logger.info('Staff role delegation invoked without step-up ticket - challenge issued', {
      actorId,
      targetUserId: validated.targetUserId,
      action: 'DELEGATE_STAFF_ROLE',
    });
    return {
      success: false,
      challengeRequired: true,
      challenge: createStepUpChallenge('DELEGATE_STAFF_ROLE'),
    };
  }

  const isValidTicket = consumeStepUpTicket(
    stepUpTicket,
    actorId,
    'DELEGATE_STAFF_ROLE'
  );

  if (!isValidTicket) {
    logger.warn('Staff role delegation invoked with invalid or expired step-up ticket', {
      actorId,
      ticketId: stepUpTicket,
    });
    return {
      success: false,
      challengeRequired: true,
      challenge: createStepUpChallenge('DELEGATE_STAFF_ROLE'),
    };
  }

  // 5. Look up existing user (from repository if provided)
  let userEmail = 'staff@kdsolution.it';
  let userFullName = 'Office Staff Member';
  let oldRole: Role = staffRoleRegistry.get(validated.targetUserId) ?? Role.SUPPORT;
  let userStatus = 'active';

  if (userRepo) {
    const user = await userRepo.findById(validated.targetUserId);
    if (!user) {
      throw new Error(`Target user "${validated.targetUserId}" was not found.`);
    }
    userEmail = user.email;
    userFullName = user.full_legal_name;
    userStatus = user.status;
  }

  // 6. Mutate staff role
  staffRoleRegistry.set(validated.targetUserId, validated.newRole);

  logger.info('Staff role delegated successfully by Super Admin', {
    actorId,
    targetUserId: validated.targetUserId,
    oldRole,
    newRole: validated.newRole,
    reason: validated.reason,
  });

  // 7. Audit Logging
  if (auditRepo) {
    try {
      await auditRepo.createLog({
        company_id: '00000000-0000-7000-8000-000000000000', // Platform root
        actor_id: actorId,
        action: 'STAFF_ROLE_DELEGATED',
        entity_type: 'user_role',
        entity_id: validated.targetUserId,
        payload: {
          actor_role: actorRole,
          targetUserId: validated.targetUserId,
          targetEmail: userEmail,
          oldRole,
          newRole: validated.newRole,
          reason: validated.reason,
          clientIp: clientIp ?? '127.0.0.1',
        },
      });
    } catch (auditErr) {
      logger.error('Failed to log staff role delegation audit event', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }
  }

  const staffMember: StaffMember = {
    id: validated.targetUserId,
    email: userEmail,
    fullName: userFullName,
    role: validated.newRole,
    isStaff: true,
    status: userStatus,
    twoFactorEnabled: true,
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    staffMember,
    oldRole,
    newRole: validated.newRole,
  };
}
