// path: lib/jobs/sanctions-rescreen.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import {
  runDailySanctionsRescreeningJob,
  seedScreenableEntity,
  seedSanctionsBlocklistName,
  getComplianceAlerts,
  ScreenableEntity,
} from '@/lib/compliance/rescreening-worker';

export interface SanctionsListFeedMetadata {
  source: 'OFAC_SDN' | 'UN_SECURITY_COUNCIL' | 'EU_CONSOLIDATED' | 'UK_HMT';
  lastPublishedAt: string;
  sha256Hash: string;
  entriesCount: number;
}

export interface InternationalSanctionsRescreenSummary {
  inspectedEntitiesCount: number;
  matchesDetectedCount: number;
  payoutsFrozenCount: number;
  isFeedStale: boolean;
  staleFeedWarning?: string | undefined;
  executedAt: string;
}

const auditRepo = new AuditLogRepository();

/**
 * Step 245.1: Verifies international sanctions feed freshness (OFAC, UN, EU, UK HMT).
 */
export function verifySanctionsFeedFreshness(feeds: SanctionsListFeedMetadata[], currentTime = new Date()): {
  isStale: boolean;
  warning?: string | undefined;
} {
  const nowMs = currentTime.getTime();

  for (const feed of feeds) {
    const pubMs = new Date(feed.lastPublishedAt).getTime();
    const ageHours = (nowMs - pubMs) / (1000 * 60 * 60);

    if (ageHours > 24) {
      const warning = `Critical Stale Feed Alert: Sanctions list ${feed.source} is ${Math.round(ageHours)} hours old (>24h stale threshold). Activation and payout decisions restricted.`;
      logger.error(warning, { source: feed.source, ageHours });
      return { isStale: true, warning };
    }
  }

  return { isStale: false };
}

/**
 * Step 245.2 - 245.4: Runs daily international sanctions rescreening worker across active merchants & UBOs.
 */
export async function runInternationalSanctionsRescreeningWorker(params: {
  tenantId: string;
  feeds: SanctionsListFeedMetadata[];
  currentTime?: Date | undefined;
}): Promise<InternationalSanctionsRescreenSummary> {
  const now = params.currentTime ?? new Date();
  const freshness = verifySanctionsFeedFreshness(params.feeds, now);

  const oldestFeedDate = params.feeds.length > 0
    ? params.feeds.map((f) => f.lastPublishedAt).sort()[0]!
    : now.toISOString();

  const runDateStr = now.toISOString().slice(0, 10);

  const jobResult = await runDailySanctionsRescreeningJob({
    tenantId: params.tenantId,
    runDate: runDateStr,
    lastFeedUpdatedAtIso: oldestFeedDate,
    nowIso: now.toISOString(),
  });

  const summary: InternationalSanctionsRescreenSummary = {
    inspectedEntitiesCount: jobResult.totalEntitiesScreened,
    matchesDetectedCount: jobResult.matchesDetected,
    payoutsFrozenCount: jobResult.payoutsFrozenCount,
    isFeedStale: freshness.isStale,
    staleFeedWarning: freshness.warning,
    executedAt: now.toISOString(),
  };

  logger.info('International sanctions rescreening worker finished', {
    inspected: summary.inspectedEntitiesCount,
    matches: summary.matchesDetectedCount,
    frozen: summary.payoutsFrozenCount,
    isStale: summary.isFeedStale,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'SANCTIONS_INTERNATIONAL_RESCREEN_COMPLETED',
      entity_type: 'sanctions_rescreening_run',
      entity_id: generateUuidV7(),
      payload: {
        inspectedCount: summary.inspectedEntitiesCount,
        matchesCount: summary.matchesDetectedCount,
        isFeedStale: summary.isFeedStale,
      },
    });
  } catch {}

  return summary;
}
