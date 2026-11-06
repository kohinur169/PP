// path: types/approval-chain.ts

import { z } from 'zod';
import { BaseEntity, CreateEntityInput, UpdateEntityInput } from './entity';

/**
 * Status of an individual step in the multi-level approval chain.
 */
export type ChainStepStatus =
  | 'pending'
  | 'awaiting_action'
  | 'approved'
  | 'rejected'
  | 'skipped'
  | 'cancelled';

/**
 * Platform operations requiring sequential 3-tier approval (Requester -> CEO -> Super Admin).
 */
export type ChainActionType =
  | 'large_payout'
  | 'platform_fee_change'
  | 'country_availability_toggle'
  | 'underwriting_policy_change';

/**
 * Approval Chain Step Entity mapping step sequence, required role, and actor sign-off.
 */
export interface ApprovalChainStepEntity extends BaseEntity {
  readonly chain_id: string;
  readonly company_id: string;
  readonly proposal_id?: string | null | undefined;
  readonly action_type: ChainActionType | string;
  readonly step_order: number;
  readonly required_role: string;
  readonly actor_id?: string | null | undefined;
  readonly status: ChainStepStatus;
  readonly decision_notes?: string | null | undefined;
  readonly action_payload: Record<string, unknown>;
  readonly decided_at?: string | null | undefined;
}

/**
 * Input for creating an individual approval chain step.
 */
export type CreateApprovalChainStepInput = CreateEntityInput<ApprovalChainStepEntity>;

/**
 * Input for updating an individual approval chain step.
 */
export type UpdateApprovalChainStepInput = UpdateEntityInput<ApprovalChainStepEntity>;

/**
 * Aggregated approval chain workflow state.
 */
export interface ApprovalChainWorkflow {
  readonly chainId: string;
  readonly companyId: string;
  readonly proposalId?: string | null | undefined;
  readonly actionType: ChainActionType | string;
  readonly currentStepOrder: number;
  readonly totalSteps: number;
  readonly status: 'in_progress' | 'completed' | 'rejected' | 'cancelled';
  readonly steps: ApprovalChainStepEntity[];
  readonly currentStep?: ApprovalChainStepEntity | undefined;
  readonly nextRequiredRole?: string | undefined;
}

/**
 * Zod schema for chain step status.
 */
export const ChainStepStatusSchema = z.enum([
  'pending',
  'awaiting_action',
  'approved',
  'rejected',
  'skipped',
  'cancelled',
]);

/**
 * Zod schema for chain action type.
 */
export const ChainActionTypeSchema = z.enum([
  'large_payout',
  'platform_fee_change',
  'country_availability_toggle',
  'underwriting_policy_change',
]);

/**
 * Zod schema for initiating a 3-tier sequential approval workflow.
 */
export const InitiateChainSchema = z.object({
  company_id: z.string().uuid().optional(),
  proposal_id: z.string().uuid().optional(),
  action_type: z.string().min(1),
  action_payload: z.record(z.string(), z.unknown()),
  requester_id: z.string().uuid('Valid requester UUID is required'),
  requester_role: z.string().min(1, 'Requester role is required'),
  requester_notes: z.string().max(2000).optional(),
});

/**
 * Zod schema for advancing/signing off on an approval chain step.
 */
export const StepSignOffSchema = z.object({
  chain_id: z.string().uuid('Valid chain UUID is required'),
  actor_id: z.string().uuid('Valid actor UUID is required'),
  actor_role: z.string().min(1, 'Actor role is required'),
  decision_notes: z.string().max(2000).optional(),
});

/**
 * Zod schema for rejecting an approval chain step.
 */
export const StepRejectSchema = z.object({
  chain_id: z.string().uuid('Valid chain UUID is required'),
  actor_id: z.string().uuid('Valid actor UUID is required'),
  actor_role: z.string().min(1, 'Actor role is required'),
  rejection_reason: z.string().min(3, 'Rejection reason is required'),
});
