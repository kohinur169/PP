// path: lib/compliance/calendar.ts

import { z } from 'zod';
import { AbstractRepository, EntityStorageDriver, InMemoryStorageDriver } from '@/lib/db/repository';
import { AuditLogRepository } from '@/lib/db/audit';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Role } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';
import type { BaseEntity } from '@/types/entity';

export type ComplianceEventCategory =
  | 'pci_dss'
  | 'cyber_insurance'
  | 'security_audit'
  | 'regulatory_filing'
  | 'banking_contract';

export type ComplianceEventStatus =
  | 'active'
  | 'urgent'
  | 'critical'
  | 'renewed'
  | 'expired';

export interface ComplianceCalendarEntity extends BaseEntity {
  readonly event_name: string;
  readonly category: ComplianceEventCategory;
  readonly expiry_date: string;
  readonly assigned_to: string;
  readonly status: ComplianceEventStatus;
  readonly notification_lead_days: number[];
  readonly last_alert_sent_at: string | null;
  readonly last_alert_threshold: number | null;
  readonly notes: string | null;
  readonly evidence_file_id: string | null;
}

export const ComplianceCalendarCreateSchema = z.object({
  event_name: z.string().min(3).max(255),
  category: z.enum([
    'pci_dss',
    'cyber_insurance',
    'security_audit',
    'regulatory_filing',
    'banking_contract',
  ]),
  expiry_date: z.string().datetime(),
  assigned_to: z.string().uuid(),
  status: z.enum(['active', 'urgent', 'critical', 'renewed', 'expired']).default('active'),
  notification_lead_days: z.array(z.number().int().positive()).default([90, 60, 30, 7]),
  last_alert_sent_at: z.string().datetime().nullable().optional().default(null),
  last_alert_threshold: z.number().int().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  evidence_file_id: z.string().uuid().nullable().optional().default(null),
});

export type CreateComplianceCalendarInput = {
  readonly event_name: string;
  readonly category: ComplianceEventCategory;
  readonly expiry_date: string;
  readonly assigned_to: string;
  readonly status?: ComplianceEventStatus | undefined;
  readonly notification_lead_days?: number[] | undefined;
  readonly last_alert_sent_at?: string | null | undefined;
  readonly last_alert_threshold?: number | null | undefined;
  readonly notes?: string | null | undefined;
  readonly evidence_file_id?: string | null | undefined;
  readonly id?: string | undefined;
  readonly company_id?: string | undefined;
};

const sharedCalendarDriver = new InMemoryStorageDriver<ComplianceCalendarEntity>();

/**
 * Resets the in-memory store for test isolation.
 */
export function clearComplianceCalendarStore(): void {
  sharedCalendarDriver.clear();
}

/**
 * Repository for Compliance Deadlines & Renewal Tracker.
 */
export class ComplianceCalendarRepository extends AbstractRepository<ComplianceCalendarEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<ComplianceCalendarEntity> | undefined;
  }) {
    super('ComplianceCalendarEvent', {
      defaultCompanyId:
        options?.defaultCompanyId ?? '00000000-0000-7000-8000-000000000000',
      driver: options?.driver ?? sharedCalendarDriver,
    });
  }

  public override async create(input: CreateComplianceCalendarInput): Promise<ComplianceCalendarEntity> {
    return super.create({
      event_name: input.event_name,
      category: input.category,
      expiry_date: input.expiry_date,
      assigned_to: input.assigned_to,
      status: input.status ?? 'active',
      notification_lead_days: input.notification_lead_days ?? [90, 60, 30, 7],
      last_alert_sent_at: input.last_alert_sent_at ?? null,
      last_alert_threshold: input.last_alert_threshold ?? null,
      notes: input.notes ?? null,
      evidence_file_id: input.evidence_file_id ?? null,
      id: input.id,
      company_id: input.company_id,
    });
  }

  /**
   * Retrieves active events sorted by upcoming expiry date.
   */
  public async getUpcomingDeadlines(): Promise<ComplianceCalendarEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    return all
      .filter((e) => e.status !== 'renewed')
      .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
  }
}

const defaultCalendarRepo = new ComplianceCalendarRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Calculates remaining calendar days between a reference date and expiration date.
 */
export function calculateDaysRemaining(
  expiryDate: string | Date,
  referenceDate: Date = new Date()
): number {
  const expiryTime = new Date(expiryDate).getTime();
  const refTime = referenceDate.getTime();
  const diffMs = expiryTime - refTime;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Step 079.2: Evaluates compliance deadline status based on days remaining.
 */
export function evaluateEventUrgency(daysRemaining: number): ComplianceEventStatus {
  if (daysRemaining <= 0) {
    return 'expired';
  }
  if (daysRemaining <= 30) {
    return 'critical';
  }
  if (daysRemaining <= 60) {
    return 'urgent';
  }
  return 'active';
}

export interface DispatchedCalendarAlert {
  readonly eventId: string;
  readonly eventName: string;
  readonly category: ComplianceEventCategory;
  readonly daysRemaining: number;
  readonly threshold: number;
  readonly severity: 'HIGH' | 'CRITICAL';
  readonly recipientRoles: readonly Role[];
  readonly dispatchedAt: string;
  readonly message: string;
}

const calendarAlertsQueue: DispatchedCalendarAlert[] = [];

/**
 * Clears the alert queue for test isolation.
 */
export function clearDispatchedCalendarAlerts(): void {
  calendarAlertsQueue.length = 0;
}

/**
 * Retrieves dispatched calendar alerts.
 */
export function getDispatchedCalendarAlerts(): readonly DispatchedCalendarAlert[] {
  return [...calendarAlertsQueue];
}

/**
 * Step 079.3: Background notification worker sending escalation alerts
 * at 90d, 60d, 30d, and 7d before expiration.
 */
export async function processComplianceCalendarAlerts(
  options?: {
    readonly referenceDate?: Date | undefined;
    readonly repo?: ComplianceCalendarRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<{
  readonly processedEvents: number;
  readonly alertsGenerated: number;
  readonly alerts: readonly DispatchedCalendarAlert[];
}> {
  const refDate = options?.referenceDate ?? new Date();
  const calendarRepo = options?.repo ?? defaultCalendarRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const events = await calendarRepo.getUpcomingDeadlines();
  const generatedAlerts: DispatchedCalendarAlert[] = [];

  for (const event of events) {
    const daysRemaining = calculateDaysRemaining(event.expiry_date, refDate);
    const newUrgency = evaluateEventUrgency(daysRemaining);

    // Determine breached thresholds (daysRemaining <= threshold)
    const breachedThresholds = event.notification_lead_days.filter((t) => daysRemaining <= t);

    // The most urgent breached threshold is the minimum among breached thresholds (e.g. at 45d, breached: [90, 60], active: 60)
    const triggeredThreshold =
      breachedThresholds.length > 0 ? Math.min(...breachedThresholds) : undefined;

    const shouldAlert =
      triggeredThreshold !== undefined &&
      (event.last_alert_threshold === null || triggeredThreshold < event.last_alert_threshold);

    if (shouldAlert) {
      const severity: 'HIGH' | 'CRITICAL' = daysRemaining <= 30 ? 'CRITICAL' : 'HIGH';
      const recipientRoles: Role[] =
        daysRemaining <= 30
          ? [Role.COMPLIANCE_KYC, Role.CEO, Role.SUPER_ADMIN]
          : [Role.COMPLIANCE_KYC, Role.SUPER_ADMIN];

      const message = `[COMPLIANCE DEADLINE ALERT] "${event.event_name}" (${event.category}) expires in ${daysRemaining} day(s) on ${new Date(event.expiry_date).toISOString().slice(0, 10)}. Threshold: ${triggeredThreshold}d. Escalation alert dispatched.`;

      const alert: DispatchedCalendarAlert = {
        eventId: event.id,
        eventName: event.event_name,
        category: event.category,
        daysRemaining,
        threshold: triggeredThreshold,
        severity,
        recipientRoles,
        dispatchedAt: refDate.toISOString(),
        message,
      };

      generatedAlerts.push(alert);
      calendarAlertsQueue.push(alert);

      // Audit log alert dispatch
      try {
        await auditRepo.createLog({
          company_id: '00000000-0000-7000-8000-000000000000',
          actor_id: '00000000-0000-0000-0000-000000000000', // Automated cron actor
          action: 'COMPLIANCE_DEADLINE_ALERT',
          entity_type: 'compliance_calendar_event',
          entity_id: event.id,
          payload: {
            eventName: event.event_name,
            category: event.category,
            daysRemaining,
            triggeredThreshold,
            severity,
            recipientRoles,
            timestamp: refDate.toISOString(),
          },
        });
      } catch (err: unknown) {
        logger.error('Failed to log compliance calendar alert', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Update event state
      await calendarRepo.update(event.id, event.version, {
        status: newUrgency,
        last_alert_sent_at: refDate.toISOString(),
        last_alert_threshold: triggeredThreshold,
      });
    } else if (newUrgency !== event.status) {
      // Update status if changed (e.g. active -> urgent)
      await calendarRepo.update(event.id, event.version, {
        status: newUrgency,
      });
    }
  }

  return {
    processedEvents: events.length,
    alertsGenerated: generatedAlerts.length,
    alerts: generatedAlerts,
  };
}

/**
 * Marks a compliance item as renewed, updating expiry date and attaching proof file.
 */
export async function markEventRenewed(
  params: {
    readonly eventId: string;
    readonly newExpiryDate: string;
    readonly evidenceFileId?: string | undefined;
    readonly actorId: string;
    readonly notes?: string | undefined;
  },
  options?: {
    readonly repo?: ComplianceCalendarRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<ComplianceCalendarEntity> {
  const { eventId, newExpiryDate, evidenceFileId, actorId, notes } = params;
  const calendarRepo = options?.repo ?? defaultCalendarRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;

  const event = await calendarRepo.findById(eventId);
  if (!event) {
    throw new Error(`Compliance event "${eventId}" not found.`);
  }

  const updated = await calendarRepo.update(event.id, event.version, {
    expiry_date: newExpiryDate,
    status: 'renewed',
    evidence_file_id: evidenceFileId ?? event.evidence_file_id,
    notes: notes ?? event.notes,
    last_alert_threshold: null,
  });

  try {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: actorId,
      action: 'COMPLIANCE_DEADLINE_RENEWED',
      entity_type: 'compliance_calendar_event',
      entity_id: updated.id,
      payload: {
        eventName: updated.event_name,
        newExpiryDate,
        evidenceFileId,
        actorId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    logger.error('Failed to log compliance renewal', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return updated;
}
