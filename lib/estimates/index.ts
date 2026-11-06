// path: lib/estimates/index.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Estimate, EstimateStatus, EstimateItem } from '@/types/estimate';
import { calculateInvoiceTotals, RawLineItemInput } from '@/lib/invoices/totals';

const estimateCounters = new Map<string, number>();
const estimatesStore = new Map<string, Estimate>();
const auditRepo = new AuditLogRepository();

/**
 * Step 191: Generates next sequential estimate number.
 */
export function generateNextEstimateNumber(input: {
  tenantId: string;
  companyId: string;
  prefix?: string | undefined;
  padLength?: number | undefined;
}): string {
  const prefix = input.prefix ?? 'EST-';
  const padLength = input.padLength ?? 4;
  const key = `${input.tenantId}:${input.companyId}:${prefix}`;

  const current = estimateCounters.get(key) ?? 0;
  const next = current + 1;
  estimateCounters.set(key, next);

  return `${prefix}${String(next).padStart(padLength, '0')}`;
}

/**
 * Step 191.1: Creates a new estimate with calculated line item totals.
 */
export function createEstimate(input: {
  tenantId: string;
  companyId: string;
  clientName: string;
  clientEmail: string;
  items: RawLineItemInput[];
  expiresInDays?: number | undefined;
  notes?: string | undefined;
  terms?: string | undefined;
}): Estimate {
  const id = generateUuidV7();
  const now = new Date();
  const estimateNumber = generateNextEstimateNumber({
    tenantId: input.tenantId,
    companyId: input.companyId,
  });

  const totals = calculateInvoiceTotals(input.items);
  const expirationDate = new Date(now.getTime() + (input.expiresInDays ?? 30) * 24 * 60 * 60 * 1000);

  const estimateItems: EstimateItem[] = totals.items.map((item) => ({
    id: generateUuidV7(),
    tenantId: input.tenantId,
    estimateId: id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount,
    taxAmount: item.taxAmount,
    total: item.total,
    sortOrder: item.sortOrder,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }));

  const estimate: Estimate = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    estimateNumber,
    status: 'draft',
    currency: 'USD',
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    issueDate: now.toISOString().split('T')[0],
    expiresAt: expirationDate.toISOString(),
    notes: input.notes,
    terms: input.terms,
    items: estimateItems,
    version: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  estimatesStore.set(id, estimate);

  logger.info('Estimate created', {
    estimateId: id,
    estimateNumber,
    total: totals.total,
  });

  return estimate;
}

/**
 * Step 191.2: Checks estimate expiration and transitions to 'void' if expired.
 */
export async function evaluateEstimateExpiration(
  estimate: Estimate,
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Promise<{ isExpired: boolean; estimate: Estimate }> {
  if (estimate.status === 'converted' || estimate.status === 'accepted' || estimate.status === 'void') {
    return { isExpired: false, estimate };
  }

  const isExpired = Date.now() > new Date(estimate.expiresAt).getTime();

  if (isExpired) {
    const previousStatus = estimate.status;
    estimate.status = 'void';
    estimate.notes = estimate.notes
      ? `${estimate.notes}\n[EXPIRED: Automatically voided due to passing expiration date ${estimate.expiresAt}]`
      : `[EXPIRED: Automatically voided due to passing expiration date ${estimate.expiresAt}]`;
    estimate.updatedAt = new Date().toISOString();
    estimate.version += 1;

    estimatesStore.set(estimate.id, estimate);

    logger.info('Estimate expired and voided automatically', {
      estimateId: estimate.id,
      estimateNumber: estimate.estimateNumber,
    });

    try {
      await auditRepo.append({
        actor_id: actorId,
        action: 'ESTIMATE_EXPIRED',
        entity_type: 'estimate',
        entity_id: estimate.id,
        payload: {
          estimateNumber: estimate.estimateNumber,
          previousStatus,
          expiresAt: estimate.expiresAt,
        },
      });
    } catch {}
  }

  return { isExpired, estimate };
}

/**
 * Step 191.3: Client declines estimate; immediately transitions status to 'void'.
 */
export async function declineEstimate(
  estimate: Estimate,
  reason: string,
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Promise<Estimate> {
  if (estimate.status === 'void' || estimate.status === 'converted') {
    throw new Error(`Cannot decline estimate in '${estimate.status}' status.`);
  }

  const previousStatus = estimate.status;
  estimate.status = 'void';
  estimate.notes = estimate.notes
    ? `${estimate.notes}\n[DECLINED BY CLIENT: ${reason}]`
    : `[DECLINED BY CLIENT: ${reason}]`;
  estimate.updatedAt = new Date().toISOString();
  estimate.version += 1;

  estimatesStore.set(estimate.id, estimate);

  logger.info('Estimate declined and voided', {
    estimateId: estimate.id,
    estimateNumber: estimate.estimateNumber,
    reason,
  });

  try {
    await auditRepo.append({
      actor_id: actorId,
      action: 'ESTIMATE_DECLINED',
      entity_type: 'estimate',
      entity_id: estimate.id,
      payload: {
        estimateNumber: estimate.estimateNumber,
        previousStatus,
        reason,
      },
    });
  } catch {}

  return estimate;
}

export function getEstimate(id: string): Estimate | undefined {
  return estimatesStore.get(id);
}

export function resetEstimatesStore(): void {
  estimatesStore.clear();
  estimateCounters.clear();
}
