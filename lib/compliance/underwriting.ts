// path: lib/compliance/underwriting.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger';
import {
  validateMerchantMccEligibility,
  PROHIBITED_MCC_CATALOG,
  RESTRICTED_MCC_CATALOG,
} from '@/lib/compliance/mcc';

export type RiskTier = 1 | 2 | 3;

export interface RiskTierParameters {
  riskTier: RiskTier;
  singleTransactionCap: Money;
  monthlyVolumeCap: Money;
  rollingReservePercent: number; // e.g. 10.00
  rollingReserveDays: number; // e.g. 90
}

export const TIER_1_PARAMETERS: RiskTierParameters = {
  riskTier: 1,
  singleTransactionCap: new Money('500.0000'),
  monthlyVolumeCap: new Money('2500.0000'),
  rollingReservePercent: 10.0,
  rollingReserveDays: 90,
};

export const TIER_2_PARAMETERS: RiskTierParameters = {
  riskTier: 2,
  singleTransactionCap: new Money('2500.0000'),
  monthlyVolumeCap: new Money('25000.0000'),
  rollingReservePercent: 5.0,
  rollingReserveDays: 60,
};

export const TIER_3_PARAMETERS: RiskTierParameters = {
  riskTier: 3,
  singleTransactionCap: new Money('10000.0000'),
  monthlyVolumeCap: new Money('100000.0000'),
  rollingReservePercent: 0.0,
  rollingReserveDays: 0,
};

export interface CompanyUnderwritingData {
  mccCode: string;
  businessAgeMonths: number;
  monthlyCashflowUsd?: number | undefined;
  websiteRiskScore?: number | undefined; // 0 to 100, where higher is riskier
  requestedMonthlyVolumeUsd?: number | undefined;
  requestedMaxTransactionUsd?: number | undefined;
  isNewMerchant?: boolean | undefined; // defaults to true
  hasCompletedProbationaryPeriod?: boolean | undefined; // true if >= 90 days active processing
  historicalChargebackRatePercent?: number | undefined;
}

export interface UnderwritingResult {
  riskTier: RiskTier;
  singleTransactionCap: Money;
  monthlyVolumeCap: Money;
  rollingReservePercent: number;
  rollingReserveDays: number;
  compositeRiskScore: number; // 0 to 100
  mccCategory: string;
  requestedLimitsApproved: boolean;
  explanations: string[];
}

export interface CompanyRiskProfileRecord {
  id: string;
  tenantId: string;
  companyId: string;
  riskTier: RiskTier;
  singleTransactionCapUsd: string; // numeric(18, 4)
  monthlyVolumeCapUsd: string; // numeric(18, 4)
  rollingReservePercent: number;
  rollingReserveDays: number;
  mccCode: string;
  mccCategory: string;
  riskScore: number;
  version: number;
  reviewerId?: string | undefined;
  approvedAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Calculates underwriting tiers and assigns starting limits.
 * ENFORCEMENT RULE: All new approved sellers initialize strictly in Tier 1
 * (USD $500 per transaction, USD $2,500 monthly limit, 10% rolling reserve for 90 days),
 * regardless of requested volume.
 */
export function calculateUnderwritingTiers(
  data: CompanyUnderwritingData
): UnderwritingResult {
  const isNewMerchant = data.isNewMerchant ?? true;
  const explanations: string[] = [];

  // 1. Evaluate MCC code
  const mccEval = validateMerchantMccEligibility(data.mccCode);
  const prohibitedItem = PROHIBITED_MCC_CATALOG.find((p) => p.mcc === data.mccCode.trim());
  const restrictedItem = RESTRICTED_MCC_CATALOG.find((r) => r.mcc === data.mccCode.trim());
  const mccCategory =
    prohibitedItem?.category ?? restrictedItem?.category ?? 'Standard Commercial';

  // Base risk score from MCC: Prohibited = 100, Restricted = 65, Standard = 20
  let compositeRiskScore =
    mccEval.status === 'PROHIBITED'
      ? 100
      : mccEval.status === 'RESTRICTED'
      ? 65
      : 20;

  // 2. Adjust for business age
  if (data.businessAgeMonths < 12) {
    compositeRiskScore += 15;
    explanations.push('Business age < 12 months adds +15 risk points.');
  } else if (data.businessAgeMonths >= 36) {
    compositeRiskScore = Math.max(0, compositeRiskScore - 10);
    explanations.push('Established business (>= 3 years) lowers risk score by -10 points.');
  }

  // 3. Adjust for website risk if present
  if (data.websiteRiskScore !== undefined) {
    if (data.websiteRiskScore > 50) {
      compositeRiskScore += 10;
      explanations.push('Elevated website risk score adds +10 risk points.');
    }
  }

  compositeRiskScore = Math.min(100, Math.max(0, compositeRiskScore));

  // 4. Strict Tier 1 Assignment for New Merchants
  if (isNewMerchant || !data.hasCompletedProbationaryPeriod) {
    const requestedMonthly = data.requestedMonthlyVolumeUsd ?? 0;
    const requestedSingle = data.requestedMaxTransactionUsd ?? 0;
    const requestedHigher =
      requestedMonthly > 2500 || requestedSingle > 500;

    if (requestedHigher) {
      explanations.push(
        `Requested limits ($${requestedMonthly.toLocaleString()}/mo, $${requestedSingle.toLocaleString()}/tx) exceed initial onboarding ceilings. Underwriting Policy Rule LR-U01 strictly assigns all new merchants to Tier 1 probationary limits.`
      );
    } else {
      explanations.push(
        'New merchant initialized in Tier 1 standard probationary limits per Underwriting Policy Rule LR-U01.'
      );
    }

    explanations.push(
      'Probationary terms: 10% rolling reserve held for 90 days. Qualification for Tier 2 requires 90 days active processing with chargeback ratio < 0.5%.'
    );

    return {
      riskTier: 1,
      singleTransactionCap: TIER_1_PARAMETERS.singleTransactionCap,
      monthlyVolumeCap: TIER_1_PARAMETERS.monthlyVolumeCap,
      rollingReservePercent: TIER_1_PARAMETERS.rollingReservePercent,
      rollingReserveDays: TIER_1_PARAMETERS.rollingReserveDays,
      compositeRiskScore,
      mccCategory,
      requestedLimitsApproved: !requestedHigher,
      explanations,
    };
  }

  // 5. Tier Assessment for Established / Non-New Merchants (after probation)
  const chargebackRate = data.historicalChargebackRatePercent ?? 0;

  if (compositeRiskScore <= 30 && chargebackRate < 0.25 && data.businessAgeMonths >= 24) {
    explanations.push(
      'Low composite risk profile and clean processing track record qualified merchant for Tier 3 limits ($10,000/tx, $100,000/mo, 0% reserve).'
    );
    return {
      riskTier: 3,
      singleTransactionCap: TIER_3_PARAMETERS.singleTransactionCap,
      monthlyVolumeCap: TIER_3_PARAMETERS.monthlyVolumeCap,
      rollingReservePercent: TIER_3_PARAMETERS.rollingReservePercent,
      rollingReserveDays: TIER_3_PARAMETERS.rollingReserveDays,
      compositeRiskScore,
      mccCategory,
      requestedLimitsApproved: true,
      explanations,
    };
  }

  explanations.push(
    'Established merchant with compliant probationary history assigned to Tier 2 ($2,500/tx, $25,000/mo, 5% 60-day reserve).'
  );
  return {
    riskTier: 2,
    singleTransactionCap: TIER_2_PARAMETERS.singleTransactionCap,
    monthlyVolumeCap: TIER_2_PARAMETERS.monthlyVolumeCap,
    rollingReservePercent: TIER_2_PARAMETERS.rollingReservePercent,
    rollingReserveDays: TIER_2_PARAMETERS.rollingReserveDays,
    compositeRiskScore,
    mccCategory,
    requestedLimitsApproved: true,
    explanations,
  };
}

/**
 * Creates an immutable company risk profile record for database persistence.
 */
export function createCompanyRiskProfileRecord(params: {
  tenantId: string;
  companyId: string;
  underwriting: UnderwritingResult;
  mccCode: string;
  reviewerId?: string | undefined;
  version?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}): CompanyRiskProfileRecord {
  const now = new Date().toISOString();
  const id = generateUuidV7();

  logger.info('Company risk profile generated', {
    companyId: params.companyId,
    riskTier: params.underwriting.riskTier,
    monthlyCap: params.underwriting.monthlyVolumeCap.toNumericString(),
    singleCap: params.underwriting.singleTransactionCap.toNumericString(),
    reviewerId: params.reviewerId,
  });

  return {
    id,
    tenantId: params.tenantId,
    companyId: params.companyId,
    riskTier: params.underwriting.riskTier,
    singleTransactionCapUsd: params.underwriting.singleTransactionCap.toNumericString(),
    monthlyVolumeCapUsd: params.underwriting.monthlyVolumeCap.toNumericString(),
    rollingReservePercent: params.underwriting.rollingReservePercent,
    rollingReserveDays: params.underwriting.rollingReserveDays,
    mccCode: params.mccCode,
    mccCategory: params.underwriting.mccCategory,
    riskScore: params.underwriting.compositeRiskScore,
    version: params.version ?? 1,
    reviewerId: params.reviewerId,
    approvedAt: now,
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}
