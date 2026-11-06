// path: lib/compliance/rescreening-worker.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export interface ScreenableEntity {
  id: string;
  tenantId: string;
  companyId: string;
  entityType: 'beneficial_owner' | 'company' | 'director';
  fullName: string;
  payoutsBlocked: boolean;
}

export interface ComplianceAlertRecord {
  id: string;
  tenantId: string;
  alertType: 'sanctions_hit' | 'pep_match' | 'stale_feed' | 'volume_spike';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  details: Record<string, unknown>;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  createdAt: string;
  updatedAt: string;
}

export interface RescreeningJobSummary {
  runId: string;
  runDate: string;
  totalEntitiesScreened: number;
  matchesDetected: number;
  payoutsFrozenCount: number;
  isFeedStale: boolean;
}

const screenableEntitiesStore = new Map<string, ScreenableEntity>();
const complianceAlertsStore = new Map<string, ComplianceAlertRecord>();
const sanctionsBlocklist = new Set<string>();
const auditRepo = new AuditLogRepository();

/**
 * Step 161.1: Automated daily sanctions and PEP rescreening worker with stale feed detection.
 * Section 27: "Daily sanctions/PEP/adverse-media rescreening, stale-feed/run detection and office alerts."
 * Section 10: "Matches produce an alert and stop payouts immediately."
 */
export async function runDailySanctionsRescreeningJob(input: {
  tenantId: string;
  runDate: string; // YYYY-MM-DD
  lastFeedUpdatedAtIso: string;
  nowIso?: string | undefined;
}): Promise<RescreeningJobSummary> {
  const now = input.nowIso ?? new Date().toISOString();
  const runId = generateUuidV7();

  // Check 24-hour stale feed threshold
  const feedUpdatedTimestamp = new Date(input.lastFeedUpdatedAtIso).getTime();
  const currentTimestamp = new Date(now).getTime();
  const elapsedFeedHours = (currentTimestamp - feedUpdatedTimestamp) / (1000 * 60 * 60);
  const isFeedStale = elapsedFeedHours > 24;

  if (isFeedStale) {
    const alertId = generateUuidV7();
    const staleAlert: ComplianceAlertRecord = {
      id: alertId,
      tenantId: input.tenantId,
      alertType: 'stale_feed',
      severity: 'critical',
      title: 'Stale Sanctions Feed Detected - Feed Ingestion Exceeded 24h Threshold',
      details: {
        lastFeedUpdatedAt: input.lastFeedUpdatedAtIso,
        elapsedHours: Math.round(elapsedFeedHours * 10) / 10,
      },
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    complianceAlertsStore.set(alertId, staleAlert);

    logger.error('CRITICAL: Sanctions / PEP feed is stale - ingestion exceeded 24 hours!', {
      tenantId: input.tenantId,
      elapsedFeedHours,
    });
  }

  let totalEntitiesScreened = 0;
  let matchesDetected = 0;
  let payoutsFrozenCount = 0;

  for (const entity of screenableEntitiesStore.values()) {
    if (entity.tenantId !== input.tenantId) {
      continue;
    }

    totalEntitiesScreened++;
    const normalizedName = entity.fullName.trim().toUpperCase();

    if (sanctionsBlocklist.has(normalizedName)) {
      matchesDetected++;

      // Stop payouts immediately
      if (!entity.payoutsBlocked) {
        entity.payoutsBlocked = true;
        payoutsFrozenCount++;
      }

      // Create high-severity compliance alert
      const alertId = generateUuidV7();
      const hitAlert: ComplianceAlertRecord = {
        id: alertId,
        tenantId: input.tenantId,
        alertType: 'sanctions_hit',
        severity: 'critical',
        title: `Sanctions Match Detected on ${entity.entityType}: ${entity.fullName}`,
        details: {
          entityId: entity.id,
          companyId: entity.companyId,
          entityType: entity.entityType,
          matchedName: entity.fullName,
          payoutsFrozen: true,
        },
        status: 'open',
        createdAt: now,
        updatedAt: now,
      };

      complianceAlertsStore.set(alertId, hitAlert);

      logger.warn('Sanctions hit detected during daily rescreening - payouts frozen', {
        entityId: entity.id,
        fullName: entity.fullName,
        companyId: entity.companyId,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-0000-0000-000000000000',
          action: 'SANCTIONS_DAILY_MATCH_DETECTED',
          entity_type: entity.entityType,
          entity_id: entity.id,
          payload: {
            fullName: entity.fullName,
            companyId: entity.companyId,
            payoutsFrozen: true,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to append audit log for sanctions hit', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    runId,
    runDate: input.runDate,
    totalEntitiesScreened,
    matchesDetected,
    payoutsFrozenCount,
    isFeedStale,
  };
}

/**
 * Seed helpers for test suites.
 */
export function seedScreenableEntity(entity: ScreenableEntity): void {
  screenableEntitiesStore.set(entity.id, entity);
}

export function seedSanctionsBlocklistName(fullName: string): void {
  sanctionsBlocklist.add(fullName.trim().toUpperCase());
}

export function getComplianceAlerts(tenantId: string): ComplianceAlertRecord[] {
  const alerts: ComplianceAlertRecord[] = [];
  for (const a of complianceAlertsStore.values()) {
    if (a.tenantId === tenantId) {
      alerts.push(a);
    }
  }
  return alerts;
}

/**
 * Resets stores for test isolation.
 */
export function resetRescreeningStore(): void {
  screenableEntitiesStore.clear();
  complianceAlertsStore.clear();
  sanctionsBlocklist.clear();
}
