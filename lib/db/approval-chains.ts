// path: lib/db/approval-chains.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import type {
  ApprovalChainStepEntity,
  CreateApprovalChainStepInput,
} from '../../types/approval-chain';

/**
 * Enterprise Repository for Multi-Level Sequential Approval Chains.
 * Tracks step order, required roles, actor sign-offs, and state progression.
 */
export class ApprovalChainRepository extends AbstractRepository<ApprovalChainStepEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<ApprovalChainStepEntity> | undefined;
  }) {
    super('ApprovalChainStep', options);
  }

  /**
   * Overrides create to provide defaults and ensure company_id fallback.
   */
  public override async create(
    input: CreateApprovalChainStepInput
  ): Promise<ApprovalChainStepEntity> {
    return await super.create({
      ...input,
      company_id:
        input.company_id ??
        this.defaultCompanyId ??
        '00000000-0000-7000-8000-000000000000',
      status: input.status ?? 'pending',
      action_payload: input.action_payload ?? {},
      actor_id: input.actor_id ?? null,
      decision_notes: input.decision_notes ?? null,
      decided_at: input.decided_at ?? null,
    });
  }

  /**
   * Finds all steps belonging to a given approval chain, sorted in ascending step order.
   */
  public async findChainSteps(chainId: string): Promise<ApprovalChainStepEntity[]> {
    const steps = await this.driver.findMany((record) => {
      return record.deleted_at === null && record.chain_id === chainId;
    });
    return steps.sort((a, b) => a.step_order - b.step_order);
  }

  /**
   * Finds all steps currently awaiting action by a specific role.
   */
  public async findAwaitingActionByRole(role: string): Promise<ApprovalChainStepEntity[]> {
    return await this.driver.findMany((record) => {
      return (
        record.deleted_at === null &&
        record.status === 'awaiting_action' &&
        record.required_role === role
      );
    });
  }

  /**
   * Finds all chains awaiting action across all roles.
   */
  public async findAllAwaitingAction(): Promise<ApprovalChainStepEntity[]> {
    return await this.driver.findMany((record) => {
      return record.deleted_at === null && record.status === 'awaiting_action';
    });
  }
}
