// path: lib/partners/commission-engine.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { getPartner } from '@/lib/partners/partner-engine';

export type CommissionModelType =
  | 'volume_percentage'
  | 'platform_fee_percentage'
  | 'fixed_bounty';

export interface VolumeTierRule {
  minVolumeUsd: number;
  maxVolumeUsd?: number | undefined;
  rateBasisPoints?: number | undefined;
  feeSharePercentage?: number | undefined;
  tierName: string;
}

export interface CommissionAgreementRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  modelType: CommissionModelType;
  rateBasisPoints: number;
  feeSharePercentage: number;
  bountyAmountUsd: number;
  tieredStructure: VolumeTierRule[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyCommissionRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  billingCycle: string; // YYYY-MM
  totalReferredVolumeUsd: number;
  totalPlatformFeeUsd: number;
  effectiveTier: string;
  earnedCommissionUsd: number;
  status: 'accrued' | 'tax_hold' | 'paid' | 'cancelled';
  ledgerJournalId: string;
  createdAt: string;
  updatedAt: string;
}

const agreementsStore = new Map<string, CommissionAgreementRecord>();
const commissionsStore = new Map<string, MonthlyCommissionRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 182.1: Sets up or updates a partner commission agreement.
 * Section 31: "Revenue share models: percentage of processing volume, percentage of platform fee, fixed bounty... Tiered commission structures"
 */
export async function createCommissionAgreement(input: {
  tenantId: string;
  partnerId: string;
  modelType: CommissionModelType;
  rateBasisPoints?: number | undefined;
  feeSharePercentage?: number | undefined;
  bountyAmountUsd?: number | undefined;
  tieredStructure?: VolumeTierRule[] | undefined;
}): Promise<CommissionAgreementRecord> {
  const id = generateUuidV7();
  const now = new Date().toISOString();

  const record: CommissionAgreementRecord = {
    id,
    tenantId: input.tenantId,
    partnerId: input.partnerId,
    modelType: input.modelType,
    rateBasisPoints: input.rateBasisPoints ?? 0,
    feeSharePercentage: input.feeSharePercentage ?? 0.0,
    bountyAmountUsd: input.bountyAmountUsd ?? 0.0,
    tieredStructure: input.tieredStructure ?? [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  agreementsStore.set(input.partnerId, record);
  return record;
}

/**
 * Step 182.2: Calculates monthly partner commission based on model and volume tiers.
 * Enforces tax compliance: commissions are held in escrow ('tax_hold') if tax forms are pending.
 */
export async function calculateMonthlyPartnerCommission(input: {
  tenantId: string;
  partnerId: string;
  billingCycle: string; // YYYY-MM
  totalReferredVolumeUsd: number;
  totalPlatformFeeUsd: number;
  activatedMerchantsCount?: number | undefined;
}): Promise<MonthlyCommissionRecord> {
  const partner = getPartner(input.partnerId);
  if (!partner) {
    throw new Error(`Partner '${input.partnerId}' was not found.`);
  }

  const agreement = agreementsStore.get(input.partnerId);
  if (!agreement || !agreement.isActive) {
    throw new Error(`No active commission agreement configured for partner '${input.partnerId}'.`);
  }

  let earnedCommission = 0.0;
  let effectiveTier = 'Base Tier';

  // 1. Tiered Volume Percentage Model
  if (agreement.modelType === 'volume_percentage') {
    let rateBps = agreement.rateBasisPoints;

    if (agreement.tieredStructure.length > 0) {
      // Find matching volume tier
      for (const tier of agreement.tieredStructure) {
        if (
          input.totalReferredVolumeUsd >= tier.minVolumeUsd &&
          (tier.maxVolumeUsd === undefined || input.totalReferredVolumeUsd < tier.maxVolumeUsd)
        ) {
          rateBps = tier.rateBasisPoints ?? rateBps;
          effectiveTier = tier.tierName;
          break;
        }
      }
    }

    earnedCommission = (input.totalReferredVolumeUsd * rateBps) / 10000;
  }
  // 2. Platform Fee Percentage Model
  else if (agreement.modelType === 'platform_fee_percentage') {
    let feePct = agreement.feeSharePercentage;

    if (agreement.tieredStructure.length > 0) {
      for (const tier of agreement.tieredStructure) {
        if (
          input.totalReferredVolumeUsd >= tier.minVolumeUsd &&
          (tier.maxVolumeUsd === undefined || input.totalReferredVolumeUsd < tier.maxVolumeUsd)
        ) {
          feePct = tier.feeSharePercentage ?? feePct;
          effectiveTier = tier.tierName;
          break;
        }
      }
    }

    earnedCommission = (input.totalPlatformFeeUsd * feePct) / 100;
  }
  // 3. Fixed Bounty Model
  else if (agreement.modelType === 'fixed_bounty') {
    const count = input.activatedMerchantsCount ?? 0;
    earnedCommission = count * agreement.bountyAmountUsd;
    effectiveTier = 'Fixed Bounty';
  }

  const roundedEarnedCommission = Number(earnedCommission.toFixed(4));
  const id = generateUuidV7();
  const ledgerJournalId = generateUuidV7();
  const now = new Date().toISOString();

  // Invariant: Tax form verification check
  const status = partner.taxFormStatus === 'verified' ? 'accrued' : 'tax_hold';

  const commissionRecord: MonthlyCommissionRecord = {
    id,
    tenantId: input.tenantId,
    partnerId: input.partnerId,
    billingCycle: input.billingCycle,
    totalReferredVolumeUsd: input.totalReferredVolumeUsd,
    totalPlatformFeeUsd: input.totalPlatformFeeUsd,
    effectiveTier,
    earnedCommissionUsd: roundedEarnedCommission,
    status,
    ledgerJournalId,
    createdAt: now,
    updatedAt: now,
  };

  const storeKey = `${input.partnerId}:${input.billingCycle}`;
  commissionsStore.set(storeKey, commissionRecord);

  logger.info('Monthly partner commission calculated', {
    partnerId: input.partnerId,
    billingCycle: input.billingCycle,
    modelType: agreement.modelType,
    earnedCommissionUsd: roundedEarnedCommission,
    effectiveTier,
    status,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'PARTNER_COMMISSION_ACCRUED',
      entity_type: 'partner_monthly_commission',
      entity_id: id,
      payload: {
        partnerId: input.partnerId,
        billingCycle: input.billingCycle,
        earnedCommissionUsd: roundedEarnedCommission,
        effectiveTier,
        status,
        ledgerJournalId,
      },
    });
  } catch {}

  return commissionRecord;
}

export function getMonthlyCommission(
  partnerId: string,
  billingCycle: string
): MonthlyCommissionRecord | undefined {
  return commissionsStore.get(`${partnerId}:${billingCycle}`);
}

export function resetCommissionEngineStore(): void {
  agreementsStore.clear();
  commissionsStore.clear();
}
