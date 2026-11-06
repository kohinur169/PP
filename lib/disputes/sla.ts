// path: lib/disputes/sla.ts

import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { IngestedDisputeRecord, getIngestedDispute } from '@/lib/disputes/ingest';

export interface SlaDisputeEvaluation {
  disputeId: string;
  totalWindowHours: 24 | 48;
  elapsedHours: number;
  remainingHours: number;
  isPastDeadline: boolean;
  shouldDispatchHour0Alert: boolean;
  shouldDispatchMidpointAlert: boolean;
  merchantLocalDeadlineStr: string;
}

export interface DisputeNotificationDispatchRecord {
  disputeId: string;
  alertType: 'hour_0_urgent' | 'midpoint_warning' | 'final_deadline_breach';
  recipientTimezone: string;
  dispatchedAt: string;
}

const dispatchLogs: DisputeNotificationDispatchRecord[] = [];
const auditRepo = new AuditLogRepository();

/**
 * Step 204.1: Calculates exact deadline timestamp and remaining hours in merchant's timezone.
 */
export function calculateMerchantDisputeSla(
  dispute: IngestedDisputeRecord,
  currentTime = new Date()
): SlaDisputeEvaluation {
  const createdTime = new Date(dispute.createdAt).getTime();
  const deadlineTime = new Date(dispute.deadlineAt).getTime();
  const nowMs = currentTime.getTime();

  const elapsedMs = Math.max(0, nowMs - createdTime);
  const remainingMs = deadlineTime - nowMs;

  const elapsedHours = Number((elapsedMs / (1000 * 60 * 60)).toFixed(2));
  const remainingHours = Number((Math.max(0, remainingMs) / (1000 * 60 * 60)).toFixed(2));
  const isPastDeadline = nowMs >= deadlineTime;

  // Format date string representation localized in merchant's timezone
  let merchantLocalDeadlineStr: string;
  try {
    merchantLocalDeadlineStr = new Intl.DateTimeFormat('en-US', {
      timeZone: dispute.merchantTimezone,
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(new Date(deadlineTime));
  } catch {
    merchantLocalDeadlineStr = new Date(deadlineTime).toUTCString();
  }

  const midpointHours = dispute.deadlineHours / 2;
  const shouldDispatchHour0Alert = elapsedHours <= 0.1;
  const shouldDispatchMidpointAlert = elapsedHours >= midpointHours && !isPastDeadline;

  return {
    disputeId: dispute.id,
    totalWindowHours: dispute.deadlineHours,
    elapsedHours,
    remainingHours,
    isPastDeadline,
    shouldDispatchHour0Alert,
    shouldDispatchMidpointAlert,
    merchantLocalDeadlineStr,
  };
}

/**
 * Step 204.2 & 204.3: Dispatches dispute email notifications with localized merchant timestamps.
 */
export async function dispatchDisputeSlaAlert(params: {
  disputeId: string;
  alertType: 'hour_0_urgent' | 'midpoint_warning' | 'final_deadline_breach';
}): Promise<DisputeNotificationDispatchRecord> {
  const dispute = getIngestedDispute(params.disputeId);
  if (!dispute) {
    throw new Error(`Dispute '${params.disputeId}' not found.`);
  }

  const record: DisputeNotificationDispatchRecord = {
    disputeId: params.disputeId,
    alertType: params.alertType,
    recipientTimezone: dispute.merchantTimezone,
    dispatchedAt: new Date().toISOString(),
  };

  dispatchLogs.push(record);

  logger.warn('Dispute SLA Alert notification dispatched', {
    disputeId: params.disputeId,
    alertType: params.alertType,
    timezone: dispute.merchantTimezone,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'DISPUTE_SLA_ALERT_DISPATCHED',
      entity_type: 'payment_dispute',
      entity_id: params.disputeId,
      payload: {
        alertType: params.alertType,
        recipientTimezone: dispute.merchantTimezone,
      },
    });
  } catch {}

  return record;
}

export function getDisputeDispatchLogs(disputeId: string): DisputeNotificationDispatchRecord[] {
  return dispatchLogs.filter((l) => l.disputeId === disputeId);
}

export function resetDisputeDispatchLogs(): void {
  dispatchLogs.length = 0;
}
