// path: lib/db/pending-approvals.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import type {
  PendingApprovalEntity,
  CreatePendingApprovalInput,
  ApprovalStatus,
  ApprovalActionType,
} from '../../types/approval';

/**
 * Enterprise Repository for Four-Eye Dual-Control Pending Approvals.
 * Manages proposals, initiator and approver assignments, diff summaries, and execution statuses.
 */
export class PendingApprovalRepository extends AbstractRepository<PendingApprovalEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<PendingApprovalEntity> | undefined;
  }) {
    super('PendingApproval', options);
  }

  /**
   * Overrides create to provide defaults and ensure company_id fallback.
   */
  public override async create(
    input: CreatePendingApprovalInput
  ): Promise<PendingApprovalEntity> {
    return await super.create({
      ...input,
      company_id:
        input.company_id ??
        this.defaultCompanyId ??
        '00000000-0000-7000-8000-000000000000',
      status: input.status ?? 'pending',
      diff_summary: input.diff_summary ?? [],
      current_state: input.current_state ?? {},
      proposed_payload: input.proposed_payload ?? {},
      approver_id: input.approver_id ?? null,
      approver_role: input.approver_role ?? null,
      approval_notes: input.approval_notes ?? null,
      rejection_reason: input.rejection_reason ?? null,
      approved_at: input.approved_at ?? null,
      rejected_at: input.rejected_at ?? null,
      executed_at: input.executed_at ?? null,
    });
  }


  /**
   * Finds all pending approval proposals awaiting review.
   */
  public async findPending(companyId?: string): Promise<PendingApprovalEntity[]> {
    return await this.driver.findMany((record) => {
      if (record.deleted_at !== null || record.status !== 'pending') return false;
      if (companyId && record.company_id !== companyId) return false;
      return true;
    });
  }

  /**
   * Finds pending approvals matching a specific action type and target ID.
   */
  public async findPendingByAction(
    actionType: ApprovalActionType,
    targetId?: string
  ): Promise<PendingApprovalEntity[]> {
    return await this.driver.findMany((record) => {
      if (record.deleted_at !== null || record.status !== 'pending') return false;
      if (record.action_type !== actionType) return false;
      if (targetId !== undefined && record.target_id !== targetId) return false;
      return true;
    });
  }

  /**
   * Finds all proposals with optional filtering.
   */
  public async findAllFiltered(filter?: {
    status?: ApprovalStatus | undefined;
    companyId?: string | undefined;
    actionType?: string | undefined;
    initiatorId?: string | undefined;
  }): Promise<PendingApprovalEntity[]> {
    return await this.driver.findMany((record) => {
      if (record.deleted_at !== null) return false;
      if (filter?.status && record.status !== filter.status) return false;
      if (filter?.companyId && record.company_id !== filter.companyId) return false;
      if (filter?.actionType && record.action_type !== filter.actionType) return false;
      if (filter?.initiatorId && record.initiator_id !== filter.initiatorId) return false;
      return true;
    });
  }
}
