// path: lib/settlement/fulfilment-gates.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { dispatchActivityEmail } from '@/lib/email/activity-mailer';

export interface SettlementBatchRecord {
  id: string;
  tenantId: string;
  companyId: string;
  merchantEmail: string;
  batchReference: string;
  amountUsd: number;
  reserveAmountUsd: number;
  netPayoutAmountUsd: number;
  tier: 1 | 2 | 3;
  status: 'held' | 'pending_proof' | 'pending_manual_review' | 'eligible_for_payout' | 'released' | 'disbursed';
  hasVerifiedDeliveryProof: boolean;
  deliveryVerifiedAt?: string | undefined;
  manualReviewStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  reserveHoldDays: number;
  reserveMaturationDate: string; // YYYY-MM-DD
  releasedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface GatingEvaluationResult {
  eligible: boolean;
  blockedReason?:
    | 'MISSING_FULFILMENT_PROOF'
    | 'POST_DELIVERY_DAYS_UNMET'
    | 'PENDING_COMPLIANCE_REVIEW'
    | 'RESERVE_HOLD_UNMATURED'
    | undefined;
}

export interface SettlementJobSummary {
  inspectedCount: number;
  releasedCount: number;
  blockedMissingProofCount: number;
  blockedManualReviewCount: number;
  blockedHoldUnmaturedCount: number;
}

const settlementBatchesStore = new Map<string, SettlementBatchRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Required post-delivery maturation days by merchant risk tier:
 * Tier 1: >= 7 days post-verified delivery
 * Tier 2: >= 3 days post-delivery
 * Tier 3: >= 2 days post-delivery
 */
function getTierPostDeliveryDays(tier: 1 | 2 | 3): number {
  switch (tier) {
    case 1:
      return 7;
    case 2:
      return 3;
    case 3:
      return 2;
  }
}

/**
 * Evaluates all four gating rules for settlement release.
 * "jobs never bypass a pending review or missing fulfilment proof."
 */
export function evaluateSettlementGating(
  batch: SettlementBatchRecord,
  currentDateStr: string
): GatingEvaluationResult {
  // Gate 1: Mandatory Verified Fulfilment Proof
  if (!batch.hasVerifiedDeliveryProof || !batch.deliveryVerifiedAt) {
    return { eligible: false, blockedReason: 'MISSING_FULFILMENT_PROOF' };
  }

  // Gate 2: Post-Delivery Maturation Days
  const requiredDays = getTierPostDeliveryDays(batch.tier);
  const deliveryDate = new Date(batch.deliveryVerifiedAt);
  const eligibleDate = new Date(deliveryDate);
  eligibleDate.setDate(eligibleDate.getDate() + requiredDays);
  const eligibleDateStr = eligibleDate.toISOString().slice(0, 10);

  if (eligibleDateStr > currentDateStr) {
    return { eligible: false, blockedReason: 'POST_DELIVERY_DAYS_UNMET' };
  }

  // Gate 3: USD $5,000+ Mandatory Manual Compliance Review Gate
  // "Any transaction exceeding USD $5,000 requires documented manual compliance review before capture/payout."
  if (batch.amountUsd >= 5000) {
    if (batch.manualReviewStatus !== 'approved') {
      return { eligible: false, blockedReason: 'PENDING_COMPLIANCE_REVIEW' };
    }
  }

  // Gate 4: Rolling Reserve Hold Days Maturation
  if (batch.reserveMaturationDate > currentDateStr) {
    return { eligible: false, blockedReason: 'RESERVE_HOLD_UNMATURED' };
  }

  return { eligible: true };
}

/**
 * Step 159.1: Automated background worker executing fulfilment-gated settlement release.
 * Section 27: "Fulfilment-gated settlement/payout eligibility checks and manual-review queue alerts;
 * jobs never bypass a pending review or missing fulfilment proof."
 */
export async function runFulfilmentGatedSettlementJob(
  tenantId: string,
  currentDateStr: string
): Promise<SettlementJobSummary> {
  let inspectedCount = 0;
  let releasedCount = 0;
  let blockedMissingProofCount = 0;
  let blockedManualReviewCount = 0;
  let blockedHoldUnmaturedCount = 0;

  const now = new Date().toISOString();

  for (const batch of settlementBatchesStore.values()) {
    if (batch.tenantId !== tenantId || batch.status === 'released' || batch.status === 'disbursed') {
      continue;
    }

    inspectedCount++;
    const gateEval = evaluateSettlementGating(batch, currentDateStr);

    if (gateEval.eligible) {
      batch.status = 'released';
      batch.releasedAt = now;
      batch.updatedAt = now;
      releasedCount++;

      logger.info('Settlement batch released following verified fulfilment gates', {
        batchId: batch.id,
        batchReference: batch.batchReference,
        amountUsd: batch.amountUsd,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-0000-0000-000000000000',
          action: 'SETTLEMENT_BATCH_RELEASED',
          entity_type: 'merchant_settlement_batch',
          entity_id: batch.id,
          payload: {
            batchReference: batch.batchReference,
            amountUsd: batch.amountUsd,
            netPayoutAmountUsd: batch.netPayoutAmountUsd,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to append audit log for settlement release', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Notify merchant via activity email
      try {
        await dispatchActivityEmail({
          tenantId: batch.tenantId,
          templateKey: 'settlement_released',
          recipient: batch.merchantEmail,
          variables: {
            amount: batch.netPayoutAmountUsd,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to dispatch settlement release email notification', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      // Record blocking reason and update status if needed
      if (gateEval.blockedReason === 'MISSING_FULFILMENT_PROOF') {
        batch.status = 'pending_proof';
        blockedMissingProofCount++;
      } else if (gateEval.blockedReason === 'PENDING_COMPLIANCE_REVIEW') {
        batch.status = 'pending_manual_review';
        blockedManualReviewCount++;

        logger.warn('Settlement blocked: $5,000+ manual compliance review pending', {
          batchId: batch.id,
          amountUsd: batch.amountUsd,
        });
      } else {
        blockedHoldUnmaturedCount++;
      }
      batch.updatedAt = now;
    }
  }

  return {
    inspectedCount,
    releasedCount,
    blockedMissingProofCount,
    blockedManualReviewCount,
    blockedHoldUnmaturedCount,
  };
}

/**
 * Seed helper for testing.
 */
export function seedSettlementBatch(batch: SettlementBatchRecord): void {
  settlementBatchesStore.set(batch.id, batch);
}

/**
 * Resets store for test isolation.
 */
export function resetSettlementBatchesStore(): void {
  settlementBatchesStore.clear();
}
