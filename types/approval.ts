// path: types/approval.ts

import { z } from 'zod';
import { BaseEntity, CreateEntityInput, UpdateEntityInput } from './entity';

/**
 * High-risk operation types requiring dual-control / four-eye authorization.
 */
export type ApprovalActionType =
  | 'tier_override'
  | 'large_payout'
  | 'fee_change'
  | 'kyc_approval'
  | 'risk_policy_change'
  | 'gateway_config'
  | 'account_unlock';

/**
 * Status lifecycle of a four-eye approval proposal.
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/**
 * Field-level difference representation for proposal diff inspection.
 */
export interface DiffEntry {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly changeType: 'added' | 'modified' | 'removed';
}

/**
 * Pending approval record representing a dual-control four-eye proposal.
 */
export interface PendingApprovalEntity extends BaseEntity {
  readonly company_id: string;
  readonly action_type: ApprovalActionType;
  readonly target_id?: string | null | undefined;
  readonly current_state: Record<string, unknown>;
  readonly proposed_payload: Record<string, unknown>;
  readonly diff_summary: DiffEntry[];
  readonly initiator_id: string;
  readonly initiator_role: string;
  readonly initiator_notes?: string | null | undefined;
  readonly approver_id?: string | null | undefined;
  readonly approver_role?: string | null | undefined;
  readonly approval_notes?: string | null | undefined;
  readonly rejection_reason?: string | null | undefined;
  readonly status: ApprovalStatus;
  readonly approved_at?: string | null | undefined;
  readonly rejected_at?: string | null | undefined;
  readonly executed_at?: string | null | undefined;
}

/**
 * Input for creating a new pending approval proposal.
 */
export type CreatePendingApprovalInput = CreateEntityInput<PendingApprovalEntity>;

/**
 * Input for updating an existing pending approval record.
 */
export type UpdatePendingApprovalInput = UpdateEntityInput<PendingApprovalEntity>;

/**
 * Zod schema for approval action type.
 */
export const ApprovalActionTypeSchema = z.enum([
  'tier_override',
  'large_payout',
  'fee_change',
  'kyc_approval',
  'risk_policy_change',
  'gateway_config',
  'account_unlock',
]);

/**
 * Zod schema for approval status.
 */
export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

/**
 * Zod schema for proposing a high-risk operation.
 */
export const CreateProposalSchema = z.object({
  company_id: z.string().uuid().nullable().optional(),
  action_type: ApprovalActionTypeSchema,
  target_id: z.string().max(100).nullable().optional(),
  current_state: z.record(z.string(), z.unknown()).default({}),
  proposed_payload: z.record(z.string(), z.unknown()),
  initiator_id: z.string().uuid('Valid initiator user UUID is required'),
  initiator_role: z.string().min(1, 'Initiator role is required'),
  initiator_notes: z.string().max(2000).optional(),
});


/**
 * Zod schema for reviewing/approving a proposal.
 */
export const ApproveProposalSchema = z.object({
  approver_id: z.string().uuid('Valid approver user UUID is required'),
  approver_role: z.string().min(1, 'Approver role is required'),
  approval_notes: z.string().max(2000).optional(),
});

/**
 * Zod schema for rejecting a proposal.
 */
export const RejectProposalSchema = z.object({
  approver_id: z.string().uuid('Valid approver user UUID is required'),
  approver_role: z.string().min(1, 'Approver role is required'),
  rejection_reason: z.string().min(3, 'Rejection reason is mandatory'),
});
