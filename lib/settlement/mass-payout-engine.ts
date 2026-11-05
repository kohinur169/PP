// path: lib/settlement/mass-payout-engine.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type DestinationType = 'ach' | 'wire' | 'sepa' | 'payoneer' | 'card';
export type BatchStatus =
  | 'draft'
  | 'pending_approval'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'rejected';

export interface CreatePayoutCandidateItem {
  companyId: string;
  destinationType: DestinationType;
  destinationDetails: Record<string, unknown>;
  grossBalanceUsd: number;
  disputeReserveHoldbackUsd: number;
}

export interface MassPayoutItemRecord {
  id: string;
  tenantId: string;
  batchId: string;
  companyId: string;
  destinationType: DestinationType;
  destinationDetails: Record<string, unknown>;
  grossBalanceUsd: number;
  disputeReserveHoldbackUsd: number;
  netPayoutUsd: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';
  errorMessage?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface MassPayoutBatchRecord {
  id: string;
  tenantId: string;
  batchReference: string;
  status: BatchStatus;
  totalPayoutAmountUsd: number;
  totalHoldbackUsd: number;
  itemCount: number;
  requiresDualApproval: boolean;
  firstApprovedBy?: string | undefined;
  firstApprovedAt?: string | undefined;
  secondApprovedBy?: string | undefined;
  secondApprovedAt?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const batchesStore = new Map<string, MassPayoutBatchRecord>();
const itemsStore = new Map<string, MassPayoutItemRecord>();
const auditRepo = new AuditLogRepository();

export const DUAL_APPROVAL_THRESHOLD_USD = 50000.0;

/**
 * Step 174.1: Creates a mass payout batch with holdback gates and dual-approval evaluation.
 * Section 29: "Automated mass payout batch creation and execution... dual authorization for payouts >= $50,000."
 */
export async function createMassPayoutBatch(input: {
  tenantId: string;
  batchReference: string;
  creatorUserId: string;
  candidates: CreatePayoutCandidateItem[];
}): Promise<MassPayoutBatchRecord> {
  const batchId = generateUuidV7();
  const now = new Date().toISOString();

  let totalPayoutUsd = 0;
  let totalHoldbackUsd = 0;
  const createdItems: MassPayoutItemRecord[] = [];

  for (const c of input.candidates) {
    const netPayout = Math.max(0, c.grossBalanceUsd - c.disputeReserveHoldbackUsd);
    totalPayoutUsd += netPayout;
    totalHoldbackUsd += c.disputeReserveHoldbackUsd;

    const itemId = generateUuidV7();
    const item: MassPayoutItemRecord = {
      id: itemId,
      tenantId: input.tenantId,
      batchId,
      companyId: c.companyId,
      destinationType: c.destinationType,
      destinationDetails: c.destinationDetails,
      grossBalanceUsd: c.grossBalanceUsd,
      disputeReserveHoldbackUsd: c.disputeReserveHoldbackUsd,
      netPayoutUsd: Number(netPayout.toFixed(4)),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    itemsStore.set(itemId, item);
    createdItems.push(item);
  }

  const roundedTotalPayoutUsd = Number(totalPayoutUsd.toFixed(4));
  const roundedTotalHoldbackUsd = Number(totalHoldbackUsd.toFixed(4));
  const requiresDualApproval = roundedTotalPayoutUsd >= DUAL_APPROVAL_THRESHOLD_USD;

  const batch: MassPayoutBatchRecord = {
    id: batchId,
    tenantId: input.tenantId,
    batchReference: input.batchReference,
    status: 'pending_approval',
    totalPayoutAmountUsd: roundedTotalPayoutUsd,
    totalHoldbackUsd: roundedTotalHoldbackUsd,
    itemCount: createdItems.length,
    requiresDualApproval,
    createdBy: input.creatorUserId,
    createdAt: now,
    updatedAt: now,
  };

  batchesStore.set(batchId, batch);

  logger.info('Mass payout batch created', {
    batchId,
    batchReference: input.batchReference,
    itemCount: createdItems.length,
    totalPayoutAmountUsd: roundedTotalPayoutUsd,
    requiresDualApproval,
  });

  try {
    await auditRepo.append({
      actor_id: input.creatorUserId,
      action: 'PAYOUT_BATCH_CREATED',
      entity_type: 'mass_payout_batch',
      entity_id: batchId,
      payload: {
        batchReference: input.batchReference,
        totalPayoutAmountUsd: roundedTotalPayoutUsd,
        requiresDualApproval,
        itemCount: createdItems.length,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log payout batch creation', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return batch;
}

/**
 * Step 174.2: Approves a mass payout batch.
 * Enforces dual-authorization: batches >= $50,000 require two distinct approvers.
 */
export async function approvePayoutBatch(input: {
  batchId: string;
  approverUserId: string;
}): Promise<MassPayoutBatchRecord> {
  const batch = batchesStore.get(input.batchId);
  if (!batch) {
    throw new Error(`Payout batch '${input.batchId}' was not found.`);
  }

  if (batch.status !== 'pending_approval') {
    throw new Error(`Cannot approve batch in '${batch.status}' state.`);
  }

  const now = new Date().toISOString();

  // If first approval hasn't happened yet
  if (!batch.firstApprovedBy) {
    batch.firstApprovedBy = input.approverUserId;
    batch.firstApprovedAt = now;
    batch.updatedAt = now;

    if (!batch.requiresDualApproval) {
      // Single approval sufficient (< $50,000)
      batch.status = 'processing';
      logger.info('Payout batch approved (single approval complete)', {
        batchId: batch.id,
        approver: input.approverUserId,
      });
    } else {
      logger.info('Payout batch first approval recorded (requires second approver for >= $50k)', {
        batchId: batch.id,
        firstApprover: input.approverUserId,
      });
    }
  } else {
    // Second approval
    if (!batch.requiresDualApproval) {
      throw new Error('Batch has already received required single approval.');
    }

    // Invariant: Dual authorization requires two distinct persons
    if (batch.firstApprovedBy === input.approverUserId) {
      throw new Error(
        'Dual-authorization violation: Second approval must be executed by a distinct authorized user.'
      );
    }

    batch.secondApprovedBy = input.approverUserId;
    batch.secondApprovedAt = now;
    batch.status = 'processing';
    batch.updatedAt = now;

    logger.info('Payout batch dual-approval completed, transitioning to processing', {
      batchId: batch.id,
      firstApprover: batch.firstApprovedBy,
      secondApprover: input.approverUserId,
    });
  }

  try {
    await auditRepo.append({
      actor_id: input.approverUserId,
      action: 'PAYOUT_BATCH_APPROVED',
      entity_type: 'mass_payout_batch',
      entity_id: batch.id,
      payload: {
        batchReference: batch.batchReference,
        status: batch.status,
        firstApprovedBy: batch.firstApprovedBy,
        secondApprovedBy: batch.secondApprovedBy ?? null,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log payout batch approval', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return batch;
}

/**
 * Rejects a mass payout batch.
 */
export async function rejectPayoutBatch(input: {
  batchId: string;
  rejecterUserId: string;
  reason: string;
}): Promise<MassPayoutBatchRecord> {
  const batch = batchesStore.get(input.batchId);
  if (!batch) {
    throw new Error(`Payout batch '${input.batchId}' was not found.`);
  }

  const now = new Date().toISOString();
  batch.status = 'rejected';
  batch.updatedAt = now;

  for (const item of itemsStore.values()) {
    if (item.batchId === batch.id) {
      item.status = 'rejected';
      item.errorMessage = `Batch rejected: ${input.reason}`;
      item.updatedAt = now;
    }
  }

  logger.warn('Mass payout batch rejected', {
    batchId: batch.id,
    rejecter: input.rejecterUserId,
    reason: input.reason,
  });

  return batch;
}

/**
 * Test helpers.
 */
export function getPayoutBatch(id: string): MassPayoutBatchRecord | undefined {
  return batchesStore.get(id);
}

export function getPayoutItems(batchId: string): MassPayoutItemRecord[] {
  const list: MassPayoutItemRecord[] = [];
  for (const it of itemsStore.values()) {
    if (it.batchId === batchId) {
      list.push(it);
    }
  }
  return list;
}

export function resetMassPayoutStore(): void {
  batchesStore.clear();
  itemsStore.clear();
}
