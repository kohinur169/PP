// path: lib/disputes/monitoring-program.ts

import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type ChargebackInterventionLevel = 'NORMAL' | 'LEVEL_1_WARNING' | 'LEVEL_2_RESERVE_ESCALATION' | 'LEVEL_3_SUSPENSION';

export interface CardSchemeMonitoringThresholds {
  level1WarningRatio: number;      // e.g. 0.003 (0.3%)
  level2ReserveEscalation: number; // e.g. 0.006 (0.6%)
  level3SuspensionRatio: number;   // e.g. 0.009 (0.9%)
}

export const DEFAULT_SCHEME_THRESHOLDS: CardSchemeMonitoringThresholds = {
  level1WarningRatio: 0.003,      // 0.3%
  level2ReserveEscalation: 0.006, // 0.6%
  level3SuspensionRatio: 0.009,   // 0.9%
};

export interface MerchantDisputeMetrics {
  companyId: string;
  rolling90DayVolumeCount: number;
  rolling90DayDisputeCount: number;
  chargebackRatio: number;
  currentInterventionLevel: ChargebackInterventionLevel;
  additionalReservePercent: number;
  isProcessingSuspended: boolean;
  remediationChecklistEnqueued: boolean;
  evaluatedAt: string;
}

const auditRepo = new AuditLogRepository();
let activeThresholds: CardSchemeMonitoringThresholds = { ...DEFAULT_SCHEME_THRESHOLDS };

export function configureSchemeThresholds(thresholds: Partial<CardSchemeMonitoringThresholds>): void {
  activeThresholds = { ...activeThresholds, ...thresholds };
}

export function resetSchemeThresholds(): void {
  activeThresholds = { ...DEFAULT_SCHEME_THRESHOLDS };
}

/**
 * Step 209.1 - 209.3: Evaluates merchant 90-day chargeback ratio against graduated card network thresholds.
 */
export async function evaluateMerchantChargebackMonitoring(params: {
  companyId: string;
  rolling90DayVolumeCount: number;
  rolling90DayDisputeCount: number;
}): Promise<MerchantDisputeMetrics> {
  const count = params.rolling90DayVolumeCount;
  const disputes = params.rolling90DayDisputeCount;
  const ratio = count > 0 ? Number((disputes / count).toFixed(6)) : 0;

  let intervention: ChargebackInterventionLevel = 'NORMAL';
  let additionalReservePercent = 0;
  let isProcessingSuspended = false;
  let remediationChecklistEnqueued = false;

  if (ratio >= activeThresholds.level3SuspensionRatio) {
    // Level 3 (>= 0.9%): Immediate processing suspension
    intervention = 'LEVEL_3_SUSPENSION';
    additionalReservePercent = 10;
    isProcessingSuspended = true;
    remediationChecklistEnqueued = true;
  } else if (ratio >= activeThresholds.level2ReserveEscalation) {
    // Level 2 (>= 0.6%): Mandatory +5% rolling reserve and extended hold
    intervention = 'LEVEL_2_RESERVE_ESCALATION';
    additionalReservePercent = 5;
    isProcessingSuspended = false;
    remediationChecklistEnqueued = true;
  } else if (ratio >= activeThresholds.level1WarningRatio) {
    // Level 1 (>= 0.3%): Warning notification and daily monitoring
    intervention = 'LEVEL_1_WARNING';
    additionalReservePercent = 0;
    isProcessingSuspended = false;
    remediationChecklistEnqueued = true;
  }

  const metrics: MerchantDisputeMetrics = {
    companyId: params.companyId,
    rolling90DayVolumeCount: count,
    rolling90DayDisputeCount: disputes,
    chargebackRatio: ratio,
    currentInterventionLevel: intervention,
    additionalReservePercent,
    isProcessingSuspended,
    remediationChecklistEnqueued,
    evaluatedAt: new Date().toISOString(),
  };

  logger.warn('Merchant chargeback monitoring evaluation completed', {
    companyId: params.companyId,
    ratio: `${(ratio * 100).toFixed(2)}%`,
    intervention,
    isSuspended: isProcessingSuspended,
  });

  if (intervention !== 'NORMAL') {
    try {
      await auditRepo.append({
        actor_id: '00000000-0000-0000-0000-000000000000',
        action: 'CHARGEBACK_PROGRAM_INTERVENTION_TRIGGERED',
        entity_type: 'company_risk_profiles',
        entity_id: params.companyId,
        payload: {
          chargebackRatio: ratio,
          intervention,
          additionalReservePercent,
          isProcessingSuspended,
        },
      });
    } catch {}
  }

  return metrics;
}
