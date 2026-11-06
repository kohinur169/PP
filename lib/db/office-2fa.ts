// path: lib/db/office-2fa.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import type { Office2faResetRequestEntity, CreateOffice2faResetInput } from '../../types/office-2fa';

/**
 * Enterprise Repository for Administrative 2FA Reset Requests.
 * Tracks verification document references, staff review status, and approval decisions.
 */
export class Office2faResetRepository extends AbstractRepository<Office2faResetRequestEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<Office2faResetRequestEntity> | undefined;
  }) {
    super('Office2faResetRequest', {
      defaultCompanyId:
        options?.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
      driver: options?.driver,
    });
  }

  /**
   * Creates a new pending 2FA reset request with submitted verification document IDs.
   */
  public async createRequest(
    input: CreateOffice2faResetInput
  ): Promise<Office2faResetRequestEntity> {
    return await this.create({
      user_id: input.user_id,
      ticket_id: input.ticket_id.trim(),
      verification_docs: input.verification_docs,
      reviewed_by: null,
      status: 'pending',
      rejection_reason: null,
      approved_at: null,
      company_id: input.company_id ?? this.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
    });
  }

  /**
   * Retrieves all reset requests for a user.
   */
  public async findByUserId(userId: string): Promise<Office2faResetRequestEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    return all.filter((r) => r.user_id === userId);
  }

  /**
   * Finds a reset request by support ticket reference ID.
   */
  public async findByTicketId(ticketId: string): Promise<Office2faResetRequestEntity | null> {
    const all = await this.findMany({ includeDeleted: false });
    const found = all.find((r) => r.ticket_id.toLowerCase() === ticketId.toLowerCase().trim());
    return found ?? null;
  }

  /**
   * Retrieves all pending reset requests awaiting compliance review.
   */
  public async findPendingRequests(): Promise<Office2faResetRequestEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    return all.filter((r) => r.status === 'pending');
  }

  /**
   * Records approval decision by compliance staff.
   */
  public async approveRequest(
    id: string,
    reviewerId: string,
    expectedVersion: number
  ): Promise<Office2faResetRequestEntity> {
    return await this.update(id, expectedVersion, {
      status: 'approved',
      reviewed_by: reviewerId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    });
  }

  /**
   * Records rejection decision with compliance rationale.
   */
  public async rejectRequest(
    id: string,
    reviewerId: string,
    reason: string,
    expectedVersion: number
  ): Promise<Office2faResetRequestEntity> {
    return await this.update(id, expectedVersion, {
      status: 'rejected',
      reviewed_by: reviewerId,
      rejection_reason: reason,
      approved_at: null,
    });
  }
}
