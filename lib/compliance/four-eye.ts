// path: lib/compliance/four-eye.ts

import {
  ApprovalActionType,
  ApprovalStatus,
  DiffEntry,
  PendingApprovalEntity,
  CreateProposalSchema,
  ApproveProposalSchema,
  RejectProposalSchema,
} from '@/types/approval';
import { PendingApprovalRepository } from '@/lib/db/pending-approvals';
import { AuditLogRepository } from '@/lib/db/audit';
import { Role } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';

const defaultApprovalRepo = new PendingApprovalRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Computes granular field-level differences between the current object state
 * and the proposed changes.
 */
export function computeDiff(
  currentState: Record<string, unknown> = {},
  proposedPayload: Record<string, unknown> = {}
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  const allKeys = new Set([
    ...Object.keys(currentState),
    ...Object.keys(proposedPayload),
  ]);

  for (const key of allKeys) {
    const hasCurrent = Object.prototype.hasOwnProperty.call(currentState, key);
    const hasProposed = Object.prototype.hasOwnProperty.call(proposedPayload, key);

    const oldVal = currentState[key];
    const newVal = proposedPayload[key];

    if (!hasCurrent && hasProposed) {
      diffs.push({
        field: key,
        oldValue: null,
        newValue: newVal,
        changeType: 'added',
      });
    } else if (hasCurrent && !hasProposed) {
      diffs.push({
        field: key,
        oldValue: oldVal,
        newValue: null,
        changeType: 'removed',
      });
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({
        field: key,
        oldValue: oldVal,
        newValue: newVal,
        changeType: 'modified',
      });
    }
  }

  return diffs;
}

/**
 * Validates whether an actor role is authorized to initiate a specific action proposal.
 */
export function canInitiateAction(role: string, actionType: ApprovalActionType): boolean {
  if (role === Role.SUPER_ADMIN) return true;

  switch (actionType) {
    case 'tier_override':
    case 'kyc_approval':
      return role === Role.COMPLIANCE_KYC || role === Role.CEO;
    case 'large_payout':
      return role === Role.FINANCE_OPS || role === Role.COMPLIANCE_KYC || role === Role.CEO;
    case 'fee_change':
    case 'risk_policy_change':
    case 'gateway_config':
    case 'account_unlock':
      return role === Role.CEO || role === Role.COMPLIANCE_KYC;
    default:
      return false;
  }
}

/**
 * Validates whether an actor role is authorized to approve a specific action proposal.
 */
export function canApproveAction(role: string, actionType: ApprovalActionType): boolean {
  if (role === Role.SUPER_ADMIN) return true;

  switch (actionType) {
    case 'tier_override':
    case 'large_payout':
    case 'fee_change':
    case 'risk_policy_change':
    case 'kyc_approval':
      return role === Role.CEO;
    case 'gateway_config':
      return role === Role.SUPER_ADMIN; // Only super_admin approves gateway configuration
    case 'account_unlock':
      return role === Role.COMPLIANCE_KYC || role === Role.SUPER_ADMIN;
    default:
      return false;
  }
}

/**
 * Parameters for proposing a new dual-control high-risk action.
 */
export interface ProposeActionParams {
  readonly company_id?: string | null | undefined;
  readonly action_type: ApprovalActionType;
  readonly target_id?: string | null | undefined;
  readonly current_state?: Record<string, unknown> | undefined;
  readonly proposed_payload: Record<string, unknown>;
  readonly initiator_id: string;
  readonly initiator_role: string;
  readonly initiator_notes?: string | undefined;
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
}

/**
 * Step 063.1: Proposes a new high-risk action requiring dual-control four-eye sign-off.
 */
export async function proposeHighRiskAction(
  params: ProposeActionParams,
  options?: {
    readonly approvalRepo?: PendingApprovalRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<PendingApprovalEntity> {
  const repo = options?.approvalRepo ?? defaultApprovalRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const validated = CreateProposalSchema.parse(params);

  if (!canInitiateAction(validated.initiator_role, validated.action_type)) {
    throw new Error(
      `Unauthorized: Role "${validated.initiator_role}" cannot propose "${validated.action_type}".`
    );
  }

  const diff_summary = computeDiff(
    validated.current_state,
    validated.proposed_payload
  );

  const proposal = await repo.create({
    company_id: validated.company_id ?? undefined,
    action_type: validated.action_type,
    target_id: validated.target_id ?? null,
    current_state: validated.current_state,
    proposed_payload: validated.proposed_payload,
    diff_summary,
    initiator_id: validated.initiator_id,
    initiator_role: validated.initiator_role,
    initiator_notes: validated.initiator_notes ?? null,
    status: 'pending',
  });


  try {
    await auditRepo.append({
      company_id: proposal.company_id ?? '00000000-0000-7000-8000-000000000000',
      action: 'FOUR_EYE_PROPOSAL_CREATED',
      actor_id: validated.initiator_id,
      entity_type: 'pending_approvals',
      entity_id: proposal.id,
      payload: {
        actionType: validated.action_type,
        targetId: validated.target_id,
        diffCount: diff_summary.length,
        initiatorRole: validated.initiator_role,
        clientIp: params.clientIp,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    logger.warn('Audit record creation for proposal failed non-fatally', { err });
  }

  return proposal;
}


/**
 * Parameters for approving a pending proposal.
 */
export interface ApproveActionParams {
  readonly proposalId: string;
  readonly approverId: string;
  readonly approverRole: string;
  readonly approvalNotes?: string | undefined;
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
}

/**
 * Step 063.2 & Quality Gate: Approves a pending proposal enforcing the Four-Eye Principle.
 * Strictly asserts that initiator_id !== approver_id, throwing an error if the same actor attempts sign-off.
 */
export async function approveHighRiskProposal(
  params: ApproveActionParams,
  options?: {
    readonly approvalRepo?: PendingApprovalRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<PendingApprovalEntity> {
  const repo = options?.approvalRepo ?? defaultApprovalRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const validated = ApproveProposalSchema.parse({
    approver_id: params.approverId,
    approver_role: params.approverRole,
    approval_notes: params.approvalNotes,
  });

  const proposal = await repo.findById(params.proposalId);
  if (!proposal) {
    throw new Error(`Proposal with ID "${params.proposalId}" was not found.`);
  }

  if (proposal.status !== 'pending') {
    throw new Error(
      `Cannot approve proposal in "${proposal.status}" state. Only "pending" proposals can be approved.`
    );
  }

  // STEP 063.2 & QUALITY GATE ENFORCEMENT: Dual-control rule
  if (proposal.initiator_id === validated.approver_id) {
    logger.warn('Dual-control four-eye violation detected', {
      proposalId: proposal.id,
      initiatorId: proposal.initiator_id,
      approverId: validated.approver_id,
      actionType: proposal.action_type,
    });

    throw new Error(
      `Dual-control violation: actor "${validated.approver_id}" cannot approve a proposal they initiated. A distinct approver is required under the four-eye review framework.`
    );
  }

  if (!canApproveAction(validated.approver_role, proposal.action_type)) {
    throw new Error(
      `Unauthorized: Role "${validated.approver_role}" cannot approve "${proposal.action_type}".`
    );
  }

  const nowIso = new Date().toISOString();
  const updated = await repo.update(proposal.id, proposal.version, {
    status: 'approved',
    approver_id: validated.approver_id,
    approver_role: validated.approver_role,
    approval_notes: validated.approval_notes ?? null,
    approved_at: nowIso,
    executed_at: nowIso,
  });

  try {
    await auditRepo.append({
      company_id: proposal.company_id ?? '00000000-0000-7000-8000-000000000000',
      action: 'FOUR_EYE_PROPOSAL_APPROVED',
      actor_id: validated.approver_id,
      entity_type: 'pending_approvals',
      entity_id: proposal.id,
      payload: {
        actionType: proposal.action_type,
        initiatorId: proposal.initiator_id,
        approverId: validated.approver_id,
        approverRole: validated.approver_role,
        approvalNotes: validated.approval_notes,
        status: 'approved',
        clientIp: params.clientIp,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    logger.warn('Audit record creation for proposal approval failed non-fatally', { err });
  }

  return updated;
}


/**
 * Parameters for rejecting a pending proposal.
 */
export interface RejectActionParams {
  readonly proposalId: string;
  readonly approverId: string;
  readonly approverRole: string;
  readonly rejectionReason: string;
  readonly clientIp?: string | undefined;
  readonly userAgent?: string | undefined;
}

/**
 * Rejects a pending proposal with mandatory justification.
 */
export async function rejectHighRiskProposal(
  params: RejectActionParams,
  options?: {
    readonly approvalRepo?: PendingApprovalRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<PendingApprovalEntity> {
  const repo = options?.approvalRepo ?? defaultApprovalRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const validated = RejectProposalSchema.parse({
    approver_id: params.approverId,
    approver_role: params.approverRole,
    rejection_reason: params.rejectionReason,
  });

  const proposal = await repo.findById(params.proposalId);
  if (!proposal) {
    throw new Error(`Proposal with ID "${params.proposalId}" was not found.`);
  }

  if (proposal.status !== 'pending') {
    throw new Error(
      `Cannot reject proposal in "${proposal.status}" state. Only "pending" proposals can be rejected.`
    );
  }

  const nowIso = new Date().toISOString();
  const updated = await repo.update(proposal.id, proposal.version, {
    status: 'rejected',
    approver_id: validated.approver_id,
    approver_role: validated.approver_role,
    rejection_reason: validated.rejection_reason,
    rejected_at: nowIso,
  });

  try {
    await auditRepo.append({
      company_id: proposal.company_id ?? '00000000-0000-7000-8000-000000000000',
      action: 'FOUR_EYE_PROPOSAL_REJECTED',
      actor_id: validated.approver_id,
      entity_type: 'pending_approvals',
      entity_id: proposal.id,
      payload: {
        actionType: proposal.action_type,
        initiatorId: proposal.initiator_id,
        rejectorId: validated.approver_id,
        rejectorRole: validated.approver_role,
        reason: validated.rejection_reason,
        status: 'rejected',
        clientIp: params.clientIp,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    logger.warn('Audit record creation for proposal rejection failed non-fatally', { err });
  }

  return updated;
}


/**
 * Formats proposal diff into a clean human-readable textual representation for audit logs and UI.
 */
export function formatDiffForDisplay(diffSummary: DiffEntry[]): string {
  if (diffSummary.length === 0) {
    return 'No modifications detected between current and proposed states.';
  }

  return diffSummary
    .map((diff) => {
      switch (diff.changeType) {
        case 'added':
          return `+ [ADDED] ${diff.field}: ${JSON.stringify(diff.newValue)}`;
        case 'removed':
          return `- [REMOVED] ${diff.field}: (was ${JSON.stringify(diff.oldValue)})`;
        case 'modified':
          return `~ [MODIFIED] ${diff.field}: ${JSON.stringify(diff.oldValue)} -> ${JSON.stringify(diff.newValue)}`;
      }
    })
    .join('\n');
}

/**
 * Retrieves all pending proposals.
 */
export async function getPendingProposals(
  companyId?: string,
  options?: { readonly approvalRepo?: PendingApprovalRepository | undefined }
): Promise<PendingApprovalEntity[]> {
  const repo = options?.approvalRepo ?? defaultApprovalRepo;
  return await repo.findPending(companyId);
}

/**
 * Retrieves a proposal by its unique ID.
 */
export async function getProposalById(
  id: string,
  options?: { readonly approvalRepo?: PendingApprovalRepository | undefined }
): Promise<PendingApprovalEntity | null> {
  const repo = options?.approvalRepo ?? defaultApprovalRepo;
  return await repo.findById(id);
}
