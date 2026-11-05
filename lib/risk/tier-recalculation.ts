// path: lib/risk/tier-recalculation.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export interface MonthlyVolumeRecord {
  id: string;
  tenantId: string;
  companyId: string;
  periodMonth: string; // YYYY-MM
  processedVolumeUsd: number;
  transactionCount: number;
  chargebackCount: number;
  chargebackVolumeUsd: number;
  isPeriodClosed: boolean;
}

export interface CompanyRiskProfile {
  id: string;
  tenantId: string;
  companyId: string;
  riskTier: 1 | 2 | 3;
  singleTransactionCapUsd: number;
  monthlyVolumeCapUsd: number;
  rollingReservePercent: number;
  rollingReserveDays: number;
}

export interface RecalculationResult {
  companyId: string;
  previousTier: 1 | 2 | 3;
  newTier: 1 | 2 | 3;
  actionTaken: 'UPGRADED' | 'DOWNGRADED' | 'MAINTAINED' | 'MANUAL_REVIEW_FLAGGED';
  trailingVolumeAvgUsd: number;
  chargebackRatePct: number;
  reason: string;
}

export interface RiskLimitEvaluation {
  companyId: string;
  currentVolumeUsd: number;
  monthlyCapUsd: number;
  utilizationRatio: number;
  status: 'NORMAL' | 'WARNING_80_PCT' | 'BREACHED_100_PCT';
}

const volumeCountersStore = new Map<string, MonthlyVolumeRecord>();
const riskProfilesStore = new Map<string, CompanyRiskProfile>();
const auditRepo = new AuditLogRepository();

/**
 * Tier configurations according to Section 9 of FEATURE_LIST.md:
 * Tier 1: < $50k/month, $500 max ticket, 5% rolling reserve (90 days).
 * Tier 2: $50k–$250k/month, $2,500 max ticket, 7.5% rolling reserve (120 days).
 * Tier 3: > $250k/month, bespoke ticket limits, 10% rolling reserve (180 days).
 */
export const TIER_CONFIGS = {
  1: {
    monthlyVolumeCapUsd: 50000,
    singleTransactionCapUsd: 500,
    rollingReservePercent: 5.0,
    rollingReserveDays: 90,
  },
  2: {
    monthlyVolumeCapUsd: 250000,
    singleTransactionCapUsd: 2500,
    rollingReservePercent: 7.5,
    rollingReserveDays: 120,
  },
  3: {
    monthlyVolumeCapUsd: 1000000, // Default baseline for Tier 3 bespoke
    singleTransactionCapUsd: 25000,
    rollingReservePercent: 10.0,
    rollingReserveDays: 180,
  },
} as const;

/**
 * Step 163.1: Idempotently close previous month and open new monthly volume counter.
 */
export function rollMonthlyVolumePeriod(input: {
  tenantId: string;
  companyId: string;
  closingPeriodMonth: string; // e.g. "2026-10"
  newPeriodMonth: string; // e.g. "2026-11"
}): MonthlyVolumeRecord {
  const closingKey = `${input.tenantId}:${input.companyId}:${input.closingPeriodMonth}`;
  const existingClosing = volumeCountersStore.get(closingKey);
  if (existingClosing) {
    existingClosing.isPeriodClosed = true;
  }

  const newKey = `${input.tenantId}:${input.companyId}:${input.newPeriodMonth}`;
  let newCounter = volumeCountersStore.get(newKey);
  if (!newCounter) {
    newCounter = {
      id: generateUuidV7(),
      tenantId: input.tenantId,
      companyId: input.companyId,
      periodMonth: input.newPeriodMonth,
      processedVolumeUsd: 0,
      transactionCount: 0,
      chargebackCount: 0,
      chargebackVolumeUsd: 0,
      isPeriodClosed: false,
    };
    volumeCountersStore.set(newKey, newCounter);
  }

  return newCounter;
}

/**
 * Step 163.2: Monthly tier recalculation worker.
 * Evaluates 3-month trailing volume and chargeback rates.
 */
export async function runMonthlyTierRecalculationJob(input: {
  tenantId: string;
  evaluationMonth: string; // YYYY-MM
  trailingMonths: string[]; // 3 months, e.g. ["2026-08", "2026-09", "2026-10"]
}): Promise<RecalculationResult[]> {
  const results: RecalculationResult[] = [];

  for (const profile of riskProfilesStore.values()) {
    if (profile.tenantId !== input.tenantId) {
      continue;
    }

    // Calculate trailing volume and chargeback metrics across 3 months
    let totalVolume = 0;
    let totalChargebacks = 0;
    let totalTransactions = 0;

    for (const m of input.trailingMonths) {
      const key = `${input.tenantId}:${profile.companyId}:${m}`;
      const rec = volumeCountersStore.get(key);
      if (rec) {
        totalVolume += rec.processedVolumeUsd;
        totalChargebacks += rec.chargebackCount;
        totalTransactions += rec.transactionCount;
      }
    }

    const trailingVolumeAvgUsd = totalVolume / Math.max(1, input.trailingMonths.length);
    const chargebackRatePct =
      totalTransactions > 0
        ? (totalChargebacks / totalTransactions) * 100
        : 0;

    let newTier = profile.riskTier;
    let actionTaken: RecalculationResult['actionTaken'] = 'MAINTAINED';
    let reason = 'Trailing metrics align with current tier';

    // 1. High chargeback check: breach >= 1.00% triggers risk review / downgrade
    if (chargebackRatePct >= 1.0) {
      if (profile.riskTier > 1) {
        newTier = (profile.riskTier - 1) as 1 | 2;
        actionTaken = 'DOWNGRADED';
        reason = `Excessive chargeback rate of ${chargebackRatePct.toFixed(2)}% (>= 1.00%) forced downgrade`;
      } else {
        actionTaken = 'MANUAL_REVIEW_FLAGGED';
        reason = `Tier 1 merchant breached 1.00% chargeback rate (${chargebackRatePct.toFixed(2)}%)`;
      }
    }
    // 2. Upgrade evaluation: Trailing volume above tier threshold + low chargeback rate (< 0.75%)
    else if (chargebackRatePct < 0.75) {
      if (profile.riskTier === 1 && trailingVolumeAvgUsd >= 50000) {
        newTier = 2;
        actionTaken = 'UPGRADED';
        reason = `Trailing volume avg ($${trailingVolumeAvgUsd.toFixed(2)}) exceeds $50k threshold with low chargebacks`;
      } else if (profile.riskTier === 2 && trailingVolumeAvgUsd >= 250000) {
        // Tier 3 requires manual compliance review / site visit before promotion
        actionTaken = 'MANUAL_REVIEW_FLAGGED';
        reason = `Trailing volume avg ($${trailingVolumeAvgUsd.toFixed(2)}) eligible for Tier 3; requires manual review`;
      }
    }
    // 3. Downgrade evaluation: Volume dropped below floor
    else if (profile.riskTier === 2 && trailingVolumeAvgUsd < 25000) {
      newTier = 1;
      actionTaken = 'DOWNGRADED';
      reason = `Trailing volume avg ($${trailingVolumeAvgUsd.toFixed(2)}) dropped significantly below Tier 2 floor`;
    }

    // Apply tier changes to profile
    if (newTier !== profile.riskTier) {
      const prev = profile.riskTier;
      profile.riskTier = newTier;
      profile.monthlyVolumeCapUsd = TIER_CONFIGS[newTier].monthlyVolumeCapUsd;
      profile.singleTransactionCapUsd = TIER_CONFIGS[newTier].singleTransactionCapUsd;
      profile.rollingReservePercent = TIER_CONFIGS[newTier].rollingReservePercent;
      profile.rollingReserveDays = TIER_CONFIGS[newTier].rollingReserveDays;

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-4000-8000-000000000000',
          action: 'RISK_TIER_RECALCULATED',
          entity_type: 'company_risk_profile',
          entity_id: profile.id,
          payload: {
            previousTier: prev,
            newTier,
            reason,
            trailingVolumeAvgUsd,
            chargebackRatePct,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to audit log tier recalculation', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    results.push({
      companyId: profile.companyId,
      previousTier: profile.riskTier === newTier ? profile.riskTier : (newTier === 2 ? 1 : 2),
      newTier,
      actionTaken,
      trailingVolumeAvgUsd,
      chargebackRatePct,
      reason,
    });
  }

  return results;
}

/**
 * Step 163.3: Real-time risk limit monitoring during active period.
 */
export function evaluateRealTimeRiskLimit(
  tenantId: string,
  companyId: string,
  currentPeriodMonth: string
): RiskLimitEvaluation {
  const profileKey = companyId;
  const profile = riskProfilesStore.get(profileKey);

  const defaultCap = 50000;
  const monthlyCapUsd = profile ? profile.monthlyVolumeCapUsd : defaultCap;

  const key = `${tenantId}:${companyId}:${currentPeriodMonth}`;
  const counter = volumeCountersStore.get(key);
  const currentVolumeUsd = counter ? counter.processedVolumeUsd : 0;

  const utilizationRatio = monthlyCapUsd > 0 ? currentVolumeUsd / monthlyCapUsd : 0;

  let status: RiskLimitEvaluation['status'] = 'NORMAL';
  if (utilizationRatio >= 1.0) {
    status = 'BREACHED_100_PCT';
    logger.warn('Monthly risk tier volume cap breached', {
      companyId,
      currentVolumeUsd,
      monthlyCapUsd,
      utilizationRatio,
    });
  } else if (utilizationRatio >= 0.8) {
    status = 'WARNING_80_PCT';
    logger.info('Monthly risk tier volume reaching 80% warning threshold', {
      companyId,
      currentVolumeUsd,
      monthlyCapUsd,
      utilizationRatio,
    });
  }

  return {
    companyId,
    currentVolumeUsd,
    monthlyCapUsd,
    utilizationRatio,
    status,
  };
}

/**
 * Seed helpers for test suites.
 */
export function seedRiskProfile(profile: CompanyRiskProfile): void {
  riskProfilesStore.set(profile.companyId, profile);
}

export function seedMonthlyVolumeCounter(counter: MonthlyVolumeRecord): void {
  const key = `${counter.tenantId}:${counter.companyId}:${counter.periodMonth}`;
  volumeCountersStore.set(key, counter);
}

export function getRiskProfile(companyId: string): CompanyRiskProfile | undefined {
  return riskProfilesStore.get(companyId);
}

/**
 * Reset store for test isolation.
 */
export function resetTierRecalculationStore(): void {
  volumeCountersStore.clear();
  riskProfilesStore.clear();
}
