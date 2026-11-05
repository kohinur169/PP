// path: lib/disputes/deadline-worker.ts

import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { dispatchActivityEmail } from '@/lib/email/activity-mailer';

export interface PaymentDisputeRecord {
  id: string;
  tenantId: string;
  companyId: string;
  paymentId: string;
  amount: number;
  currency: string;
  reason: string;
  status: 'needs_response' | 'under_review' | 'evidence_submitted' | 'won' | 'lost' | 'expired';
  deadlineAt: string; // ISO string
  contactEmail: string;
  warning7dSentAt?: string | undefined;
  warning48hSentAt?: string | undefined;
  warning12hSentAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeWarningsJobSummary {
  inspectedDisputesCount: number;
  warnings7dDispatchedCount: number;
  warnings48hDispatchedCount: number;
  warnings12hDispatchedCount: number;
  expiredCount: number;
}

const disputesStore = new Map<string, PaymentDisputeRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 166.1: Dispute Evidence Deadline Warnings Worker (7d, 48h, 12h).
 * Section 27: "Dispute evidence deadline warnings: 7-day, 48-hour, 12-hour warnings before processor deadline."
 * Section 19: "Submission deadline: countdown timer to processor deadline; automated alerts at 7d, 48h, 12h."
 */
export async function runDisputeEvidenceDeadlineWarningsJob(input: {
  tenantId: string;
  nowIso?: string | undefined;
}): Promise<DisputeWarningsJobSummary> {
  const now = input.nowIso ?? new Date().toISOString();
  const currentTimestamp = new Date(now).getTime();

  let inspectedDisputesCount = 0;
  let warnings7dDispatchedCount = 0;
  let warnings48hDispatchedCount = 0;
  let warnings12hDispatchedCount = 0;
  let expiredCount = 0;

  for (const dispute of disputesStore.values()) {
    if (dispute.tenantId !== input.tenantId || dispute.status !== 'needs_response') {
      continue;
    }

    inspectedDisputesCount++;

    const deadlineTimestamp = new Date(dispute.deadlineAt).getTime();
    const remainingMs = deadlineTimestamp - currentTimestamp;
    const remainingHours = remainingMs / (1000 * 60 * 60);

    // Case 1: Deadline has passed with no evidence submitted
    if (remainingHours <= 0) {
      dispute.status = 'expired';
      dispute.updatedAt = now;
      expiredCount++;

      logger.warn('Dispute evidence submission deadline expired', {
        disputeId: dispute.id,
        deadlineAt: dispute.deadlineAt,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-4000-8000-000000000000',
          action: 'DISPUTE_DEADLINE_EXPIRED',
          entity_type: 'payment_dispute',
          entity_id: dispute.id,
          payload: {
            deadlineAt: dispute.deadlineAt,
            amount: dispute.amount,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to audit log dispute expiration', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    // Case 2: 12-Hour Critical Warning (remainingHours <= 12)
    if (remainingHours <= 12 && !dispute.warning12hSentAt) {
      dispute.warning12hSentAt = now;
      dispute.updatedAt = now;
      warnings12hDispatchedCount++;

      logger.warn('Dispute 12-hour final deadline warning triggered', {
        disputeId: dispute.id,
        remainingHours,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-4000-8000-000000000000',
          action: 'DISPUTE_DEADLINE_WARNING_12H',
          entity_type: 'payment_dispute',
          entity_id: dispute.id,
          payload: {
            remainingHours: Math.round(remainingHours * 10) / 10,
            deadlineAt: dispute.deadlineAt,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to audit log 12h warning', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await sendDisputeWarningEmail(dispute, '12 hours');
    }
    // Case 3: 48-Hour Warning (remainingHours <= 48)
    else if (remainingHours <= 48 && !dispute.warning48hSentAt) {
      dispute.warning48hSentAt = now;
      dispute.updatedAt = now;
      warnings48hDispatchedCount++;

      logger.warn('Dispute 48-hour deadline warning triggered', {
        disputeId: dispute.id,
        remainingHours,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-4000-8000-000000000000',
          action: 'DISPUTE_DEADLINE_WARNING_48H',
          entity_type: 'payment_dispute',
          entity_id: dispute.id,
          payload: {
            remainingHours: Math.round(remainingHours * 10) / 10,
            deadlineAt: dispute.deadlineAt,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to audit log 48h warning', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await sendDisputeWarningEmail(dispute, '48 hours');
    }
    // Case 4: 7-Day Warning (remainingHours <= 168)
    else if (remainingHours <= 168 && !dispute.warning7dSentAt) {
      dispute.warning7dSentAt = now;
      dispute.updatedAt = now;
      warnings7dDispatchedCount++;

      logger.info('Dispute 7-day deadline warning triggered', {
        disputeId: dispute.id,
        remainingHours,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-4000-8000-000000000000',
          action: 'DISPUTE_DEADLINE_WARNING_7D',
          entity_type: 'payment_dispute',
          entity_id: dispute.id,
          payload: {
            remainingHours: Math.round(remainingHours * 10) / 10,
            deadlineAt: dispute.deadlineAt,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to audit log 7d warning', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await sendDisputeWarningEmail(dispute, '7 days');
    }
  }

  return {
    inspectedDisputesCount,
    warnings7dDispatchedCount,
    warnings48hDispatchedCount,
    warnings12hDispatchedCount,
    expiredCount,
  };
}

/**
 * Dispatches email alert for dispute deadline.
 */
async function sendDisputeWarningEmail(dispute: PaymentDisputeRecord, windowLabel: string): Promise<void> {
  try {
    await dispatchActivityEmail({
      tenantId: dispute.tenantId,
      templateKey: 'dispute_update',
      recipient: dispute.contactEmail,
      variables: {
        disputeId: dispute.id,
        deadlineAt: `${dispute.deadlineAt} (${windowLabel} remaining)`,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to dispatch dispute deadline email', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Seed and test helpers.
 */
export function seedPaymentDispute(dispute: PaymentDisputeRecord): void {
  disputesStore.set(dispute.id, dispute);
}

export function getPaymentDispute(disputeId: string): PaymentDisputeRecord | undefined {
  return disputesStore.get(disputeId);
}

export function resetDisputeWarningsStore(): void {
  disputesStore.clear();
}
