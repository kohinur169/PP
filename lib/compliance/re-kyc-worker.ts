// path: lib/compliance/re-kyc-worker.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type ReKycTriggerReason =
  | 'TIER_3_ANNUAL_SCHEDULED'
  | 'TIER_1_2_BIENNIAL_SCHEDULED'
  | 'VOLUME_SPIKE_REVIEW'
  | 'UBO_CHANGE'
  | 'ADDRESS_CHANGE'
  | 'CHARGEBACK_THRESHOLD_BREACH';

export type ReKycStatus = 'scheduled' | 'in_progress' | 'cleared' | 'overdue_restricted';

export interface MerchantKycProfile {
  companyId: string;
  tenantId: string;
  tier: 1 | 2 | 3;
  lastKycApprovedAt: string; // ISO date
  historicalAvgMonthlyVolumeUsd: number;
  currentMonthVolumeUsd: number;
}

export interface ReKycScheduleRecord {
  id: string;
  tenantId: string;
  companyId: string;
  triggerReason: ReKycTriggerReason;
  dueDate: string; // YYYY-MM-DD
  status: ReKycStatus;
  payoutsRestricted: boolean;
  offerCreationRestricted: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReKycJobSummary {
  inspectedCount: number;
  scheduledCreatedCount: number;
  volumeSpikesTriggeredCount: number;
  overdueRestrictedCount: number;
}

const reKycSchedulesStore = new Map<string, ReKycScheduleRecord>();
const merchantProfilesStore = new Map<string, MerchantKycProfile>();
const auditRepo = new AuditLogRepository();

/**
 * Resolves re-KYC interval in days:
 * Tier 3: Annual (365 days)
 * Tier 1 & 2: Biennial (730 days)
 */
function getReKycIntervalDays(tier: 1 | 2 | 3): number {
  return tier === 3 ? 365 : 730;
}

/**
 * Step 162.1: Automated Scheduled Re-KYC Job (Tier 3 Annual, Tier 1/2 Biennial).
 * Section 27: "Scheduled Tier 3 annual and Tier 1/2 biennial re-KYC, plus event-triggered re-KYC and configured volume-spike review."
 */
export async function runScheduledReKycEvaluationJob(input: {
  tenantId: string;
  currentDateStr: string; // YYYY-MM-DD
}): Promise<ReKycJobSummary> {
  let inspectedCount = 0;
  let scheduledCreatedCount = 0;
  let volumeSpikesTriggeredCount = 0;
  let overdueRestrictedCount = 0;

  const now = new Date().toISOString();
  const currentTimestamp = new Date(input.currentDateStr).getTime();

  for (const profile of merchantProfilesStore.values()) {
    if (profile.tenantId !== input.tenantId) {
      continue;
    }

    inspectedCount++;

    // 1. Evaluate Scheduled Interval Re-KYC
    const intervalDays = getReKycIntervalDays(profile.tier);
    const lastApprovedTimestamp = new Date(profile.lastKycApprovedAt).getTime();
    const elapsedDays = Math.floor((currentTimestamp - lastApprovedTimestamp) / (1000 * 60 * 60 * 24));

    if (elapsedDays >= intervalDays) {
      const reason: ReKycTriggerReason =
        profile.tier === 3 ? 'TIER_3_ANNUAL_SCHEDULED' : 'TIER_1_2_BIENNIAL_SCHEDULED';

      // Check if already scheduled
      let alreadyScheduled = false;
      for (const s of reKycSchedulesStore.values()) {
        if (s.companyId === profile.companyId && s.status === 'scheduled') {
          alreadyScheduled = true;
          break;
        }
      }

      if (!alreadyScheduled) {
        const id = generateUuidV7();
        const schedule: ReKycScheduleRecord = {
          id,
          tenantId: profile.tenantId,
          companyId: profile.companyId,
          triggerReason: reason,
          dueDate: input.currentDateStr,
          status: 'scheduled',
          payoutsRestricted: false,
          offerCreationRestricted: false,
          metadata: {
            tier: profile.tier,
            elapsedDays,
            intervalDays,
          },
          createdAt: now,
          updatedAt: now,
        };

        reKycSchedulesStore.set(id, schedule);
        scheduledCreatedCount++;

        logger.info('Scheduled re-KYC review initiated', {
          companyId: profile.companyId,
          tier: profile.tier,
          reason,
          elapsedDays,
        });
      }
    }

    // 2. Evaluate Volume Spike Review (>= 200% historical baseline)
    if (profile.historicalAvgMonthlyVolumeUsd > 0) {
      const ratio = profile.currentMonthVolumeUsd / profile.historicalAvgMonthlyVolumeUsd;
      if (ratio >= 2.0) {
        let hasSpikeReview = false;
        for (const s of reKycSchedulesStore.values()) {
          if (
            s.companyId === profile.companyId &&
            s.triggerReason === 'VOLUME_SPIKE_REVIEW' &&
            s.status !== 'cleared'
          ) {
            hasSpikeReview = true;
            break;
          }
        }

        if (!hasSpikeReview) {
          const id = generateUuidV7();
          const spikeSchedule: ReKycScheduleRecord = {
            id,
            tenantId: profile.tenantId,
            companyId: profile.companyId,
            triggerReason: 'VOLUME_SPIKE_REVIEW',
            dueDate: input.currentDateStr,
            status: 'scheduled',
            payoutsRestricted: false,
            offerCreationRestricted: false,
            metadata: {
              currentVolume: profile.currentMonthVolumeUsd,
              baselineVolume: profile.historicalAvgMonthlyVolumeUsd,
              spikeRatio: Math.round(ratio * 100) / 100,
            },
            createdAt: now,
            updatedAt: now,
          };

          reKycSchedulesStore.set(id, spikeSchedule);
          volumeSpikesTriggeredCount++;

          logger.warn('Volume-spike event re-KYC triggered', {
            companyId: profile.companyId,
            spikeRatio: ratio,
          });
        }
      }
    }
  }

  // 3. Mark Overdue Unresolved Re-KYC as Restricting Payouts
  for (const schedule of reKycSchedulesStore.values()) {
    if (schedule.tenantId === input.tenantId && schedule.status === 'scheduled') {
      if (schedule.dueDate < input.currentDateStr) {
        schedule.status = 'overdue_restricted';
        schedule.payoutsRestricted = true;
        schedule.offerCreationRestricted = true;
        schedule.updatedAt = now;
        overdueRestrictedCount++;

        logger.error('Re-KYC overdue: merchant payouts and offer creation restricted', {
          companyId: schedule.companyId,
          dueDate: schedule.dueDate,
        });
      }
    }
  }

  return {
    inspectedCount,
    scheduledCreatedCount,
    volumeSpikesTriggeredCount,
    overdueRestrictedCount,
  };
}

/**
 * Step 162.2: Manually or event-trigger a re-KYC review (e.g. UBO change, Address change).
 */
export async function triggerEventReKyc(input: {
  tenantId: string;
  companyId: string;
  reason: ReKycTriggerReason;
  dueDate: string;
  actorUserId: string;
}): Promise<ReKycScheduleRecord> {
  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: ReKycScheduleRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    triggerReason: input.reason,
    dueDate: input.dueDate,
    status: 'scheduled',
    payoutsRestricted: false,
    offerCreationRestricted: false,
    metadata: {
      triggeredByActor: input.actorUserId,
    },
    createdAt: now,
    updatedAt: now,
  };

  reKycSchedulesStore.set(id, record);

  logger.info('Event re-KYC triggered', {
    companyId: input.companyId,
    reason: input.reason,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorUserId,
      action: 'RE_KYC_EVENT_TRIGGERED',
      entity_type: 're_kyc_schedule',
      entity_id: id,
      payload: {
        companyId: input.companyId,
        reason: input.reason,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for event re-KYC', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Seed helper for test suites.
 */
export function seedMerchantKycProfile(profile: MerchantKycProfile): void {
  merchantProfilesStore.set(profile.companyId, profile);
}

export function seedReKycSchedule(schedule: ReKycScheduleRecord): void {
  reKycSchedulesStore.set(schedule.id, schedule);
}

export function getReKycSchedules(tenantId: string): ReKycScheduleRecord[] {
  const list: ReKycScheduleRecord[] = [];
  for (const s of reKycSchedulesStore.values()) {
    if (s.tenantId === tenantId) {
      list.push(s);
    }
  }
  return list;
}

/**
 * Resets stores for test isolation.
 */
export function resetReKycStore(): void {
  reKycSchedulesStore.clear();
  merchantProfilesStore.clear();
}
