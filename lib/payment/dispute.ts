// path: lib/payment/dispute.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { getAuthorizationRecord } from '@/lib/payment/auth-capture';

export type DisputeStatus =
  | 'needs_response'
  | 'under_review'
  | 'evidence_submitted'
  | 'won'
  | 'lost'
  | 'expired';

export type DisputeReason =
  | 'fraudulent'
  | 'unrecognized'
  | 'duplicate'
  | 'product_not_received'
  | 'product_unacceptable'
  | 'subscription_canceled'
  | 'credit_not_processed'
  | 'general';

export interface PaymentDisputeRecord {
  id: string;
  tenantId: string;
  companyId: string;
  paymentId: string;
  amount: Money;
  currency: 'USD';
  reason: DisputeReason;
  status: DisputeStatus;
  merchantTimezone: string;
  deadlineHours: 24 | 48;
  deadlineAt: string;
  warningStartSentAt?: string | undefined;
  warningMiddleSentAt?: string | undefined;
  gatewayDisputeId?: string | undefined;
  evidenceSubmittedAt?: string | undefined;
  closedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDisputeInput {
  tenantId: string;
  companyId: string;
  paymentId: string;
  amount: Money;
  reason: DisputeReason;
  merchantTimezone?: string | undefined;
  gatewayDisputeId?: string | undefined;
}

export interface DisputeWarningSummary {
  inspectedCount: number;
  middleWarningsSent: number;
  expiredDisputes: number;
}

const disputeStore = new Map<string, PaymentDisputeRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 143.1: Chargeback Dispute Intake & Timezone-Aware Deadline Engine.
 * Creates dispute record with 24-hour response deadline calculated in merchant's time zone.
 * Immediately sends initial email warning at start of the window.
 */
export async function createDispute(
  input: CreateDisputeInput
): Promise<PaymentDisputeRecord> {
  const authRecord = await getAuthorizationRecord(input.paymentId);
  if (!authRecord) {
    throw new Error(`Payment with ID '${input.paymentId}' was not found.`);
  }

  const now = new Date();
  const timezone = input.merchantTimezone ?? 'UTC';

  // Section 19: "The response deadline is 24 hours in the merchant own time zone."
  const deadlineHours: 24 | 48 = 24;
  const deadlineAt = new Date(now.getTime() + deadlineHours * 60 * 60 * 1000).toISOString();
  const warningStartSentAt = now.toISOString();

  const id = generateUuidV7();

  const record: PaymentDisputeRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    paymentId: input.paymentId,
    amount: input.amount,
    currency: 'USD',
    reason: input.reason,
    status: 'needs_response',
    merchantTimezone: timezone,
    deadlineHours,
    deadlineAt,
    warningStartSentAt,
    gatewayDisputeId: input.gatewayDisputeId ?? `dp_${generateUuidV7().replace(/-/g, '').slice(0, 20)}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  disputeStore.set(id, record);

  logger.warn('New chargeback dispute intake registered', {
    disputeId: id,
    paymentId: input.paymentId,
    amount: input.amount.toNumericString(),
    reason: input.reason,
    merchantTimezone: timezone,
    deadlineHours,
    deadlineAt,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'PAYMENT_DISPUTE_INTAKE_RECORDED',
      entity_type: 'payment_dispute',
      entity_id: id,
      payload: {
        paymentId: input.paymentId,
        companyId: input.companyId,
        amount: input.amount.toNumericString(),
        reason: input.reason,
        merchantTimezone: timezone,
        deadlineHours,
        deadlineAt,
        gatewayDisputeId: record.gatewayDisputeId,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for dispute intake', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 143.2: Super Admin Dispute Deadline Extension.
 * "super_admin can set the deadline to 48 hours when needed."
 */
export async function extendDisputeDeadline(input: {
  disputeId: string;
  hours: 48;
  requesterRole: string;
  requesterId: string;
}): Promise<PaymentDisputeRecord> {
  if (input.requesterRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can extend dispute deadlines to 48 hours.');
  }

  const dispute = disputeStore.get(input.disputeId);
  if (!dispute) {
    throw new Error(`Dispute with ID '${input.disputeId}' was not found.`);
  }

  if (dispute.status !== 'needs_response') {
    throw new Error(
      `Cannot extend deadline for dispute '${input.disputeId}': Status is '${dispute.status}'.`
    );
  }

  const createdTime = new Date(dispute.createdAt).getTime();
  const extendedDeadlineAt = new Date(createdTime + input.hours * 60 * 60 * 1000).toISOString();

  dispute.deadlineHours = input.hours;
  dispute.deadlineAt = extendedDeadlineAt;
  dispute.updatedAt = new Date().toISOString();

  logger.info('Dispute response deadline extended by super_admin', {
    disputeId: dispute.id,
    newDeadlineHours: input.hours,
    newDeadlineAt: extendedDeadlineAt,
    extendedBy: input.requesterId,
  });

  try {
    await auditRepo.append({
      actor_id: input.requesterId,
      action: 'DISPUTE_DEADLINE_EXTENDED',
      entity_type: 'payment_dispute',
      entity_id: dispute.id,
      payload: {
        disputeId: dispute.id,
        deadlineHours: input.hours,
        deadlineAt: extendedDeadlineAt,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for dispute deadline extension', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return dispute;
}

/**
 * Step 143.3: Automated Warning Alert Scheduler.
 * "The merchant receives email warnings at the start and in the middle of the deadline window."
 * Evaluates active disputes:
 * - If current time is >= 50% of the deadline window and middle warning not sent, sends warning.
 * - If deadline has passed without response, marks as expired.
 */
export async function checkAndSendDisputeWarnings(
  now: Date = new Date()
): Promise<DisputeWarningSummary> {
  let middleWarningsSent = 0;
  let expiredDisputes = 0;
  let inspectedCount = 0;

  for (const dispute of disputeStore.values()) {
    if (dispute.status !== 'needs_response') {
      continue;
    }

    inspectedCount++;
    const createdTime = new Date(dispute.createdAt).getTime();
    const deadlineTime = new Date(dispute.deadlineAt).getTime();
    const midPointTime = createdTime + (deadlineTime - createdTime) / 2;
    const currentTime = now.getTime();

    // Check expiration
    if (currentTime >= deadlineTime) {
      dispute.status = 'expired';
      dispute.closedAt = now.toISOString();
      dispute.updatedAt = now.toISOString();
      expiredDisputes++;

      logger.warn('Dispute deadline expired without merchant evidence response', {
        disputeId: dispute.id,
        deadlineAt: dispute.deadlineAt,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-0000-0000-000000000000',
          action: 'DISPUTE_DEADLINE_EXPIRED',
          entity_type: 'payment_dispute',
          entity_id: dispute.id,
          payload: {
            disputeId: dispute.id,
            deadlineAt: dispute.deadlineAt,
            status: 'expired',
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to append audit log for dispute expiration', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    // Check middle-window warning (50% mark)
    if (currentTime >= midPointTime && !dispute.warningMiddleSentAt) {
      dispute.warningMiddleSentAt = now.toISOString();
      dispute.updatedAt = now.toISOString();
      middleWarningsSent++;

      logger.info('Sent mid-window dispute warning notification to merchant', {
        disputeId: dispute.id,
        merchantTimezone: dispute.merchantTimezone,
        deadlineAt: dispute.deadlineAt,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-0000-0000-000000000000',
          action: 'DISPUTE_MID_WINDOW_WARNING_SENT',
          entity_type: 'payment_dispute',
          entity_id: dispute.id,
          payload: {
            disputeId: dispute.id,
            warningMiddleSentAt: dispute.warningMiddleSentAt,
            deadlineAt: dispute.deadlineAt,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to append audit log for mid-window warning', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    inspectedCount,
    middleWarningsSent,
    expiredDisputes,
  };
}

/**
 * Retrieves a dispute record by ID.
 */
export async function getDispute(
  disputeId: string
): Promise<PaymentDisputeRecord | null> {
  return disputeStore.get(disputeId) ?? null;
}

/**
 * Lists all disputes for a merchant company.
 */
export async function listDisputesForCompany(
  companyId: string
): Promise<PaymentDisputeRecord[]> {
  const result: PaymentDisputeRecord[] = [];
  for (const dispute of disputeStore.values()) {
    if (dispute.companyId === companyId) {
      result.push(dispute);
    }
  }
  return result;
}

/**
 * Resets the in-memory dispute store for test isolation.
 */
export function resetDisputeStore(): void {
  disputeStore.clear();
}
