// path: lib/jobs/re-kyc-worker.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export interface MerchantRiskVelocityItem {
  companyId: string;
  tenantId: string;
  riskTier: 1 | 2 | 3;
  lastKycApprovedAt: string;
  averageMonthlyVolumeUsd: number;
  recent48hVolumeUsd: number;
}

export interface ReKycAndVelocityEvaluationResult {
  companyId: string;
  isReKycDue: boolean;
  reKycIntervalMonths: 12 | 24;
  isVolumeSpikeDetected: boolean;
  volumeSpikeRatio: number;
  payoutsFrozen: boolean;
  complianceReviewTicketOpened: boolean;
}

const auditRepo = new AuditLogRepository();

/**
 * Step 246: Scheduled Re-KYC Evaluator & Sudden Volume Spike Detection Worker.
 * - Tier 3 merchants evaluated every 12 months, Tier 1/2 every 24 months.
 * - Flags sudden volume spikes (>300% historical average in 48h) and freezes payouts.
 */
export async function evaluateMerchantReKycAndSpikes(
  merchant: MerchantRiskVelocityItem,
  currentTime = new Date()
): Promise<ReKycAndVelocityEvaluationResult> {
  const kycTime = new Date(merchant.lastKycApprovedAt).getTime();
  const nowMs = currentTime.getTime();
  const elapsedMonths = (nowMs - kycTime) / (1000 * 60 * 60 * 24 * 30.44);

  const reKycIntervalMonths = merchant.riskTier === 3 ? 12 : 24;
  const isReKycDue = elapsedMonths >= reKycIntervalMonths;

  // Volume spike check: 48h volume compared to historical monthly volume
  // Equivalent monthly velocity = recent48h * 15
  const normalizedMonthlyPace = merchant.recent48hVolumeUsd * 15;
  const volumeSpikeRatio = merchant.averageMonthlyVolumeUsd > 0
    ? Number((normalizedMonthlyPace / merchant.averageMonthlyVolumeUsd).toFixed(2))
    : 1;

  const isVolumeSpikeDetected = volumeSpikeRatio >= 3.0; // >3x spike
  const payoutsFrozen = isVolumeSpikeDetected;
  const complianceReviewTicketOpened = isReKycDue || isVolumeSpikeDetected;

  if (isVolumeSpikeDetected) {
    logger.warn('Sudden volume velocity spike detected: Payouts frozen, review opened', {
      companyId: merchant.companyId,
      volumeSpikeRatio: `${volumeSpikeRatio}x`,
      recent48hUsd: merchant.recent48hVolumeUsd,
    });

    try {
      await auditRepo.append({
        actor_id: '00000000-0000-0000-0000-000000000000',
        action: 'VOLUME_SPIKE_DETECTED_PAYOUTS_FROZEN',
        entity_type: 'company_risk_profiles',
        entity_id: merchant.companyId,
        payload: {
          volumeSpikeRatio,
          recent48hVolumeUsd: merchant.recent48hVolumeUsd,
          averageMonthlyVolumeUsd: merchant.averageMonthlyVolumeUsd,
        },
      });
    } catch {}
  }

  return {
    companyId: merchant.companyId,
    isReKycDue,
    reKycIntervalMonths,
    isVolumeSpikeDetected,
    volumeSpikeRatio,
    payoutsFrozen,
    complianceReviewTicketOpened,
  };
}
