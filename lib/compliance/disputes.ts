// path: lib/compliance/disputes.ts

export interface DisputeSlaTimeline {
  disputeReceivedAt: string;
  merchantEvidenceCutoff: string;
  networkFilingCutoff: string;
  isMerchantDeadlineExpired: boolean;
  isNetworkDeadlineExpired: boolean;
  hoursRemainingMerchantDeadline: number;
}

export interface MerchantReserveTerms {
  riskTier: 1 | 2 | 3;
  reservePercent: number;
  reserveHoldingDays: number;
  description: string;
}

export interface ChargebackRatioEvaluation {
  monthlyTransactionCount: number;
  monthlyChargebackCount: number;
  ratioPercent: number;
  status: 'HEALTHY' | 'EARLY_WARNING_03' | 'CRITICAL_NETWORK_BREACH_09';
  actionRequired: string;
  mitigationPlanMandatory: boolean;
}

/**
 * Calculates strict 24-hour merchant evidence pack SLA and 48-hour network cut-off.
 */
export function calculateDisputeSla(
  disputeReceivedAt: Date | string,
  now: Date = new Date()
): DisputeSlaTimeline {
  const receivedDate = typeof disputeReceivedAt === 'string' ? new Date(disputeReceivedAt) : disputeReceivedAt;

  const merchantCutoffDate = new Date(receivedDate.getTime() + 24 * 60 * 60 * 1000);
  const networkCutoffDate = new Date(receivedDate.getTime() + 48 * 60 * 60 * 1000);

  const diffMsMerchant = merchantCutoffDate.getTime() - now.getTime();
  const hoursRemainingMerchant = Math.max(0, Math.round((diffMsMerchant / (1000 * 60 * 60)) * 10) / 10);

  return {
    disputeReceivedAt: receivedDate.toISOString(),
    merchantEvidenceCutoff: merchantCutoffDate.toISOString(),
    networkFilingCutoff: networkCutoffDate.toISOString(),
    isMerchantDeadlineExpired: now.getTime() > merchantCutoffDate.getTime(),
    isNetworkDeadlineExpired: now.getTime() > networkCutoffDate.getTime(),
    hoursRemainingMerchantDeadline: hoursRemainingMerchant,
  };
}

/**
 * Returns mandatory rolling reserve terms calibrated to platform Risk Tiers:
 * - Tier 1: 10% held for 90 days.
 * - Tier 2: 5% held for 60 days.
 * - Tier 3: 0% base reserve (low risk).
 */
export function calculateMerchantReserveTerms(
  riskTier: 1 | 2 | 3,
  customReservePercent?: number
): MerchantReserveTerms {
  if (riskTier === 1) {
    return {
      riskTier: 1,
      reservePercent: customReservePercent ?? 10,
      reserveHoldingDays: 90,
      description: 'Tier 1 High-Risk: Mandatory 10% rolling reserve held for 90 calendar days.',
    };
  }

  if (riskTier === 2) {
    return {
      riskTier: 2,
      reservePercent: customReservePercent ?? 5,
      reserveHoldingDays: 60,
      description: 'Tier 2 Medium-Risk: Mandatory 5% rolling reserve held for 60 calendar days.',
    };
  }

  return {
    riskTier: 3,
    reservePercent: customReservePercent ?? 0,
    reserveHoldingDays: 0,
    description: 'Tier 3 Low-Risk: Standard zero base rolling reserve. Standard T+2 payout cycle.',
  };
}

/**
 * Evaluates monthly chargeback ratio against Early Warning (>0.30%) and Card Network Critical (>0.90%) thresholds.
 */
export function evaluateChargebackRatio(
  monthlyTransactionCount: number,
  monthlyChargebackCount: number
): ChargebackRatioEvaluation {
  if (monthlyTransactionCount <= 0) {
    return {
      monthlyTransactionCount: 0,
      monthlyChargebackCount,
      ratioPercent: 0,
      status: 'HEALTHY',
      actionRequired: 'No commercial volume processed in calendar month.',
      mitigationPlanMandatory: false,
    };
  }

  const rawRatio = monthlyChargebackCount / monthlyTransactionCount;
  const ratioPercent = Math.round(rawRatio * 10000) / 100; // e.g. 0.35%

  if (ratioPercent >= 0.9) {
    return {
      monthlyTransactionCount,
      monthlyChargebackCount,
      ratioPercent,
      status: 'CRITICAL_NETWORK_BREACH_09',
      actionRequired:
        'CRITICAL BREACH: Chargeback ratio exceeds 0.90% network threshold (Visa VDMP / Mastercard ECP). Mandatory mitigation plan required within 5 days, gateway volume caps enforced, risk reserves elevated.',
      mitigationPlanMandatory: true,
    };
  }

  if (ratioPercent >= 0.3) {
    return {
      monthlyTransactionCount,
      monthlyChargebackCount,
      ratioPercent,
      status: 'EARLY_WARNING_03',
      actionRequired:
        'EARLY WARNING: Chargeback ratio exceeds 0.30% platform threshold. Merchant must audit customer fulfillment, clarify billing descriptors, and submit corrective plan within 10 business days.',
      mitigationPlanMandatory: true,
    };
  }

  return {
    monthlyTransactionCount,
    monthlyChargebackCount,
    ratioPercent,
    status: 'HEALTHY',
    actionRequired: 'Chargeback ratio is within healthy card network parameters (<0.30%).',
    mitigationPlanMandatory: false,
  };
}
