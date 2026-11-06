// path: lib/status/health-monitor.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { dispatchActivityEmail } from '@/lib/email/activity-mailer';

export type PlatformServiceKey =
  | 'core_api'
  | 'merchant_dashboard'
  | 'payment_nmi'
  | 'payment_stripe_connect'
  | 'payment_rainforest'
  | 'payment_airwallex'
  | 'payment_payoneer'
  | 'webhook_delivery'
  | 'hosted_payment_fields';

export type PlatformStatus =
  | 'operational'
  | 'degraded_performance'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance';

export interface ServiceStateRecord {
  id: string;
  tenantId: string;
  serviceKey: PlatformServiceKey;
  displayName: string;
  status: PlatformStatus;
  lastCheckedAt: string;
  updatedAt: string;
}

export interface SyntheticPingRecord {
  id: string;
  tenantId: string;
  serviceKey: PlatformServiceKey;
  isSuccess: boolean;
  latencyMs: number;
  errorMessage?: string | undefined;
  createdAt: string;
}

export interface StatusSubscriberRecord {
  id: string;
  tenantId: string;
  email: string;
  isVerified: boolean;
}

export interface PlatformIncidentRecord {
  id: string;
  tenantId: string;
  title: string;
  impact: 'none' | 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  affectedServiceKeys: PlatformServiceKey[];
  createdAt: string;
  updatedAt: string;
}

export interface HealthMonitorJobSummary {
  inspectedServicesCount: number;
  statusChangesCount: number;
  incidentsCreatedCount: number;
  subscriberAlertsSentCount: number;
}

export interface RollingUptimeSummary {
  serviceKey: PlatformServiceKey;
  uptime30d: number;
  uptime60d: number;
  uptime90d: number;
}

const serviceStatesStore = new Map<string, ServiceStateRecord>();
const pingLogsStore = new Map<string, SyntheticPingRecord>();
const subscribersStore = new Map<string, StatusSubscriberRecord>();
const incidentsStore = new Map<string, PlatformIncidentRecord>();
const auditRepo = new AuditLogRepository();

export const PLATFORM_SERVICES: { key: PlatformServiceKey; name: string }[] = [
  { key: 'core_api', name: 'Core API' },
  { key: 'merchant_dashboard', name: 'Merchant Dashboard' },
  { key: 'payment_nmi', name: 'Payment Processing - NMI' },
  { key: 'payment_stripe_connect', name: 'Payment Processing - Stripe Connect' },
  { key: 'payment_rainforest', name: 'Payment Processing - Rainforest' },
  { key: 'payment_airwallex', name: 'Payment Processing - Airwallex' },
  { key: 'payment_payoneer', name: 'Payment Processing - Payoneer' },
  { key: 'webhook_delivery', name: 'Webhook Delivery' },
  { key: 'hosted_payment_fields', name: 'Hosted Payment Fields' },
];

/**
 * Maps ping success rate to status value.
 */
export function resolveStatusFromSuccessRate(rate: number): PlatformStatus {
  if (rate >= 100) return 'operational';
  if (rate >= 90) return 'degraded_performance';
  if (rate >= 70) return 'partial_outage';
  return 'major_outage';
}

/**
 * Step 168.1: Record a synthetic health check ping.
 */
export function recordSyntheticPing(ping: SyntheticPingRecord): void {
  pingLogsStore.set(ping.id, ping);
}

/**
 * Step 168.2: Calculate rolling 30, 60, and 90-day uptime percentage.
 */
export function calculateRollingUptime(
  tenantId: string,
  serviceKey: PlatformServiceKey,
  nowIso?: string
): RollingUptimeSummary {
  const currentTimestamp = new Date(nowIso ?? new Date().toISOString()).getTime();
  const msInDay = 24 * 60 * 60 * 1000;

  const cutoffs = {
    d30: currentTimestamp - 30 * msInDay,
    d60: currentTimestamp - 60 * msInDay,
    d90: currentTimestamp - 90 * msInDay,
  };

  const counts = {
    d30: { total: 0, success: 0 },
    d60: { total: 0, success: 0 },
    d90: { total: 0, success: 0 },
  };

  for (const ping of pingLogsStore.values()) {
    if (ping.tenantId !== tenantId || ping.serviceKey !== serviceKey) {
      continue;
    }

    const pingTime = new Date(ping.createdAt).getTime();

    if (pingTime >= cutoffs.d90) {
      counts.d90.total++;
      if (ping.isSuccess) counts.d90.success++;

      if (pingTime >= cutoffs.d60) {
        counts.d60.total++;
        if (ping.isSuccess) counts.d60.success++;

        if (pingTime >= cutoffs.d30) {
          counts.d30.total++;
          if (ping.isSuccess) counts.d30.success++;
        }
      }
    }
  }

  const calcPct = (c: { total: number; success: number }) => {
    if (c.total === 0) return 100.0;
    return Math.round((c.success / c.total) * 10000) / 100;
  };

  return {
    serviceKey,
    uptime30d: calcPct(counts.d30),
    uptime60d: calcPct(counts.d60),
    uptime90d: calcPct(counts.d90),
  };
}

/**
 * Step 168.3: Platform Health Status Heartbeat Ping & Synthetic Monitor Worker.
 * Section 27 & Section 25.
 */
export async function runPlatformHealthMonitorJob(input: {
  tenantId: string;
  nowIso?: string | undefined;
}): Promise<HealthMonitorJobSummary> {
  const now = input.nowIso ?? new Date().toISOString();
  const currentTimestamp = new Date(now).getTime();
  const recentWindowMs = 15 * 60 * 1000; // 15-minute rolling window for status transitions

  let inspectedServicesCount = 0;
  let statusChangesCount = 0;
  let incidentsCreatedCount = 0;
  let subscriberAlertsSentCount = 0;

  for (const svc of PLATFORM_SERVICES) {
    inspectedServicesCount++;

    const key = `${input.tenantId}:${svc.key}`;
    let state = serviceStatesStore.get(key);
    if (!state) {
      state = {
        id: generateUuidV7(),
        tenantId: input.tenantId,
        serviceKey: svc.key,
        displayName: svc.name,
        status: 'operational',
        lastCheckedAt: now,
        updatedAt: now,
      };
      serviceStatesStore.set(key, state);
    }

    // Evaluate recent pings in rolling 15 min window
    let totalPings = 0;
    let successfulPings = 0;

    for (const ping of pingLogsStore.values()) {
      if (ping.tenantId === input.tenantId && ping.serviceKey === svc.key) {
        const pingTime = new Date(ping.createdAt).getTime();
        if (currentTimestamp - pingTime <= recentWindowMs) {
          totalPings++;
          if (ping.isSuccess) successfulPings++;
        }
      }
    }

    const successRate = totalPings > 0 ? (successfulPings / totalPings) * 100 : 100;
    const computedStatus = resolveStatusFromSuccessRate(successRate);

    state.lastCheckedAt = now;

    // Detect state transition
    if (computedStatus !== state.status) {
      const prevStatus = state.status;
      state.status = computedStatus;
      state.updatedAt = now;
      statusChangesCount++;

      logger.warn('Platform service status transition detected by synthetic monitor', {
        serviceKey: svc.key,
        prevStatus,
        newStatus: computedStatus,
        successRate,
      });

      // Audit log the status transition
      try {
        await auditRepo.append({
          actor_id: '00000000-0000-4000-8000-000000000000',
          action: 'PLATFORM_SERVICE_STATUS_CHANGED',
          entity_type: 'platform_service_state',
          entity_id: state.id,
          payload: {
            serviceKey: svc.key,
            prevStatus,
            newStatus: computedStatus,
            successRate,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to audit log service status transition', {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Automatically create incident when degraded or experiencing outage
      if (computedStatus !== 'operational' && prevStatus === 'operational') {
        const incidentId = generateUuidV7();
        const impact =
          computedStatus === 'major_outage'
            ? 'critical'
            : computedStatus === 'partial_outage'
            ? 'major'
            : 'minor';

        const incident: PlatformIncidentRecord = {
          id: incidentId,
          tenantId: input.tenantId,
          title: `Service Disruption: ${svc.name}`,
          impact,
          status: 'investigating',
          affectedServiceKeys: [svc.key],
          createdAt: now,
          updatedAt: now,
        };

        incidentsStore.set(incidentId, incident);
        incidentsCreatedCount++;

        // Notify verified status subscribers
        for (const sub of subscribersStore.values()) {
          if (sub.tenantId === input.tenantId && sub.isVerified) {
            subscriberAlertsSentCount++;
            try {
              await dispatchActivityEmail({
                tenantId: input.tenantId,
                templateKey: 'service_stop_restore',
                recipient: sub.email,
                variables: {
                  serviceStatus: `${svc.name} is ${computedStatus.toUpperCase()}`,
                  statusDetail: `Synthetic monitoring detected degraded performance on ${svc.name}. Our engineering team is currently investigating.`,
                },
              });
            } catch (err: unknown) {
              logger.warn('Failed to dispatch status alert to subscriber', {
                subscriberEmail: sub.email,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }
    }
  }

  return {
    inspectedServicesCount,
    statusChangesCount,
    incidentsCreatedCount,
    subscriberAlertsSentCount,
  };
}

/**
 * Seed and test helpers.
 */
export function seedStatusSubscriber(sub: StatusSubscriberRecord): void {
  subscribersStore.set(sub.id, sub);
}

export function seedServiceState(state: ServiceStateRecord): void {
  serviceStatesStore.set(`${state.tenantId}:${state.serviceKey}`, state);
}

export function getServiceState(tenantId: string, serviceKey: PlatformServiceKey): ServiceStateRecord | undefined {
  return serviceStatesStore.get(`${tenantId}:${serviceKey}`);
}

export function getPlatformIncidents(tenantId: string): PlatformIncidentRecord[] {
  const list: PlatformIncidentRecord[] = [];
  for (const inc of incidentsStore.values()) {
    if (inc.tenantId === tenantId) {
      list.push(inc);
    }
  }
  return list;
}

export function resetPlatformStatusStore(): void {
  serviceStatesStore.clear();
  pingLogsStore.clear();
  subscribersStore.clear();
  incidentsStore.clear();
}
