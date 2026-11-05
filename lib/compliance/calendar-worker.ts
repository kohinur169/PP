// path: lib/compliance/calendar-worker.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { dispatchActivityEmail } from '@/lib/email/activity-mailer';

export type CalendarUrgency = 'green' | 'yellow' | 'orange' | 'red';
export type CalendarStatus = 'active' | 'urgent' | 'critical' | 'renewed' | 'expired';
export type CalendarCategory =
  | 'corporate_filing'
  | 'aml_policy_renewal'
  | 'pci_saq_renewal'
  | 'audit_date'
  | 'sar_deadline';

export interface ComplianceCalendarEventRecord {
  id: string;
  tenantId: string;
  eventName: string;
  category: CalendarCategory;
  expiryDate: string; // ISO string
  assignedTo: string;
  status: CalendarStatus;
  notificationLeadDays: number[];
  lastAlertSentAt?: string | undefined;
  lastAlertThreshold?: number | undefined;
  notes?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarAlertsJobSummary {
  inspectedEventsCount: number;
  alertsDispatchedCount: number;
  criticalEventsCount: number;
  overdueEventsCount: number;
}

export interface CalendarUrgencyEvaluation {
  daysRemaining: number;
  urgency: CalendarUrgency;
  status: CalendarStatus;
}

const calendarEventsStore = new Map<string, ComplianceCalendarEventRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 165.1: Evaluates urgency color and status according to Section 8:
 * - Green: > 30 days remaining
 * - Yellow: 8–30 days remaining
 * - Orange: 1–7 days remaining
 * - Red: Overdue (< 0 days)
 */
export function evaluateCalendarUrgency(
  expiryDateIso: string,
  currentDateStr: string
): CalendarUrgencyEvaluation {
  const expiryTimestamp = new Date(expiryDateIso).getTime();
  const currentTimestamp = new Date(currentDateStr).getTime();
  const diffMs = expiryTimestamp - currentTimestamp;
  const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return { daysRemaining, urgency: 'red', status: 'expired' };
  }
  if (daysRemaining <= 7) {
    return { daysRemaining, urgency: 'orange', status: 'critical' };
  }
  if (daysRemaining <= 30) {
    return { daysRemaining, urgency: 'yellow', status: 'urgent' };
  }
  return { daysRemaining, urgency: 'green', status: 'active' };
}

/**
 * Step 165.2: Compliance calendar expiry alerts worker.
 * Section 27: "Compliance calendar expiry alerts for annual renewals."
 * Dispatches notification alerts when thresholds are reached.
 */
export async function runComplianceCalendarExpiryAlertsJob(input: {
  tenantId: string;
  currentDateStr: string; // YYYY-MM-DD
  officerEmail: string;
}): Promise<CalendarAlertsJobSummary> {
  let inspectedEventsCount = 0;
  let alertsDispatchedCount = 0;
  let criticalEventsCount = 0;
  let overdueEventsCount = 0;

  const now = new Date().toISOString();

  for (const event of calendarEventsStore.values()) {
    if (event.tenantId !== input.tenantId || event.status === 'renewed') {
      continue;
    }

    inspectedEventsCount++;

    const evalResult = evaluateCalendarUrgency(event.expiryDate, input.currentDateStr);
    const { daysRemaining, urgency, status } = evalResult;

    event.status = status;
    event.updatedAt = now;

    if (urgency === 'red') {
      overdueEventsCount++;
    } else if (urgency === 'orange') {
      criticalEventsCount++;
    }

    // Determine if an alert should be dispatched based on lead days
    // e.g. lead days [0, 7, 30, 60, 90] in ascending order, picking the tightest active threshold
    const matchedThreshold = event.notificationLeadDays
      .concat([0])
      .sort((a, b) => a - b)
      .find((threshold) => daysRemaining <= threshold);

    if (
      matchedThreshold !== undefined &&
      event.lastAlertThreshold !== matchedThreshold
    ) {
      alertsDispatchedCount++;
      event.lastAlertThreshold = matchedThreshold;
      event.lastAlertSentAt = now;

      logger.warn('Compliance calendar renewal alert triggered', {
        eventId: event.id,
        eventName: event.eventName,
        daysRemaining,
        matchedThreshold,
        urgency,
      });

      // Audit log the alert dispatch
      try {
        await auditRepo.append({
          actor_id: '00000000-0000-4000-8000-000000000000',
          action: 'COMPLIANCE_CALENDAR_EXPIRY_ALERT_SENT',
          entity_type: 'compliance_calendar_event',
          entity_id: event.id,
          payload: {
            eventName: event.eventName,
            category: event.category,
            daysRemaining,
            urgency,
            matchedThreshold,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to append audit log for calendar expiry alert', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Dispatch alert email
      try {
        await dispatchActivityEmail({
          tenantId: input.tenantId,
          templateKey: 'service_stop_restore',
          recipient: input.officerEmail,
          variables: {
            serviceStatus: `Compliance Renewal Due: ${event.eventName}`,
            statusDetail: `Event "${event.eventName}" (${event.category}) expires in ${daysRemaining} day(s). Urgency: ${urgency.toUpperCase()}.`,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to send calendar expiry email alert', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    inspectedEventsCount,
    alertsDispatchedCount,
    criticalEventsCount,
    overdueEventsCount,
  };
}

/**
 * Seed and test helpers.
 */
export function seedComplianceCalendarEvent(event: ComplianceCalendarEventRecord): void {
  calendarEventsStore.set(event.id, event);
}

export function getComplianceCalendarEvent(eventId: string): ComplianceCalendarEventRecord | undefined {
  return calendarEventsStore.get(eventId);
}

export function resetComplianceCalendarStore(): void {
  calendarEventsStore.clear();
}
