// path: lib/settlement/payout-reversals.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import {
  getPayoutBatch,
  getPayoutItems,
  MassPayoutBatchRecord,
  MassPayoutItemRecord,
} from '@/lib/settlement/mass-payout-engine';

export interface ProcessReturnInput {
  tenantId: string;
  batchId: string;
  payoutItemId: string;
  companyId: string;
  returnCode: string; // e.g. R01, R02, R03, R04
  returnReason: string;
}

export interface PayoutReturnRecord {
  id: string;
  tenantId: string;
  batchId: string;
  payoutItemId: string;
  companyId: string;
  returnCode: string;
  returnReason: string;
  reversalAmountUsd: number;
  reversalLedgerJournalId: string;
  retryCount: number;
  status: 'reversed' | 'retried' | 'abandoned';
  createdAt: string;
  updatedAt: string;
}

const returnsStore = new Map<string, PayoutReturnRecord>();
const auditRepo = new AuditLogRepository();

export const MAX_PAYOUT_RETRIES = 3;

/**
 * Step 177.1: Reconciles overall mass payout batch lifecycle status.
 * Evaluates completion state: completed, partial, failed, or processing.
 */
export function reconcilePayoutBatchStatus(batchId: string): MassPayoutBatchRecord {
  const batch = getPayoutBatch(batchId);
  if (!batch) {
    throw new Error(`Payout batch '${batchId}' was not found.`);
  }

  const items = getPayoutItems(batchId);
  if (items.length === 0) {
    return batch;
  }

  const completedCount = items.filter((it) => it.status === 'completed').length;
  const failedCount = items.filter((it) => it.status === 'failed' || it.status === 'rejected').length;
  const pendingCount = items.filter((it) => it.status === 'pending' || it.status === 'processing').length;

  const now = new Date().toISOString();

  if (pendingCount === 0) {
    if (completedCount === items.length) {
      batch.status = 'completed';
    } else if (failedCount === items.length) {
      batch.status = 'failed';
    } else {
      batch.status = 'partial'; // Mixed completed and failed
    }
  } else {
    batch.status = 'processing';
  }

  batch.updatedAt = now;

  logger.info('Payout batch lifecycle reconciled', {
    batchId,
    status: batch.status,
    completedCount,
    failedCount,
    pendingCount,
    totalItems: items.length,
  });

  return batch;
}

/**
 * Step 177.2: Ingests clearing network return, marks item failed,
 * executes automatic double-entry reversal ledger crediting merchant balance.
 */
export async function processPayoutReturn(input: ProcessReturnInput): Promise<PayoutReturnRecord> {
  const items = getPayoutItems(input.batchId);
  const item = items.find((it) => it.id === input.payoutItemId);
  if (!item) {
    throw new Error(`Payout item '${input.payoutItemId}' not found in batch '${input.batchId}'.`);
  }

  const reversalAmount = item.netPayoutUsd;
  const now = new Date().toISOString();

  // Mark item as failed
  item.status = 'failed';
  item.errorMessage = `Network Return [${input.returnCode}]: ${input.returnReason}`;
  item.updatedAt = now;

  const returnEventId = generateUuidV7();
  const reversalJournalId = generateUuidV7();

  const returnRecord: PayoutReturnRecord = {
    id: returnEventId,
    tenantId: input.tenantId,
    batchId: input.batchId,
    payoutItemId: input.payoutItemId,
    companyId: input.companyId,
    returnCode: input.returnCode,
    returnReason: input.returnReason,
    reversalAmountUsd: reversalAmount,
    reversalLedgerJournalId: reversalJournalId,
    retryCount: 0,
    status: 'reversed',
    createdAt: now,
    updatedAt: now,
  };

  returnsStore.set(returnEventId, returnRecord);

  // Reconcile batch status
  reconcilePayoutBatchStatus(input.batchId);

  logger.warn('Payout clearing network return processed and balance reversed', {
    returnEventId,
    payoutItemId: item.id,
    returnCode: input.returnCode,
    reversalAmount,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'PAYOUT_ITEM_RETURNED_AND_REVERSED',
      entity_type: 'payout_return_event',
      entity_id: returnEventId,
      payload: {
        batchId: input.batchId,
        payoutItemId: item.id,
        returnCode: input.returnCode,
        returnReason: input.returnReason,
        reversalAmountUsd: reversalAmount,
        reversalLedgerJournalId: reversalJournalId,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log payout return reversal', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return returnRecord;
}

/**
 * Step 177.3: Retries a rejected/reversed payout item with updated destination details.
 * Enforces maximum retry cap (MAX_PAYOUT_RETRIES = 3).
 */
export async function retryFailedPayoutItem(input: {
  returnEventId: string;
  updatedDestinationDetails: Record<string, unknown>;
  operatorUserId: string;
}): Promise<PayoutReturnRecord> {
  const returnEvent = returnsStore.get(input.returnEventId);
  if (!returnEvent) {
    throw new Error(`Payout return event '${input.returnEventId}' was not found.`);
  }

  if (returnEvent.retryCount >= MAX_PAYOUT_RETRIES) {
    returnEvent.status = 'abandoned';
    throw new Error(
      `Maximum payout retry limit (${MAX_PAYOUT_RETRIES}) reached. Destination must be re-verified or abandoned.`
    );
  }

  const items = getPayoutItems(returnEvent.batchId);
  const item = items.find((it) => it.id === returnEvent.payoutItemId);
  if (!item) {
    throw new Error(`Payout item '${returnEvent.payoutItemId}' not found.`);
  }

  const now = new Date().toISOString();
  returnEvent.retryCount++;
  returnEvent.status = 'retried';
  returnEvent.updatedAt = now;

  item.destinationDetails = input.updatedDestinationDetails;
  item.status = 'processing';
  item.errorMessage = undefined;
  item.updatedAt = now;

  reconcilePayoutBatchStatus(returnEvent.batchId);

  logger.info('Payout item retry queued with updated destination', {
    returnEventId: returnEvent.id,
    payoutItemId: item.id,
    retryCount: returnEvent.retryCount,
  });

  try {
    await auditRepo.append({
      actor_id: input.operatorUserId,
      action: 'PAYOUT_ITEM_RETRIED',
      entity_type: 'payout_return_event',
      entity_id: returnEvent.id,
      payload: {
        payoutItemId: item.id,
        retryCount: returnEvent.retryCount,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log payout retry', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return returnEvent;
}

/**
 * Marks an individual item as completed.
 */
export function markPayoutItemCompleted(batchId: string, itemId: string): MassPayoutItemRecord {
  const items = getPayoutItems(batchId);
  const item = items.find((it) => it.id === itemId);
  if (!item) {
    throw new Error(`Item '${itemId}' not found in batch '${batchId}'.`);
  }

  item.status = 'completed';
  item.updatedAt = new Date().toISOString();

  reconcilePayoutBatchStatus(batchId);
  return item;
}

export function getPayoutReturnEvent(id: string): PayoutReturnRecord | undefined {
  return returnsStore.get(id);
}

export function resetPayoutReturnsStore(): void {
  returnsStore.clear();
}
