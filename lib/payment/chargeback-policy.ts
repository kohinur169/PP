// path: lib/payment/chargeback-policy.ts

import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type ChargebackEnforcementStatus =
  | 'normal'
  | 'warning'
  | 'extra_reserve'
  | 'suspended';

export interface ChargebackThresholdPolicy {
  tenantId: string;
  minTransactionCount: number; // Minimum transaction count before percentage applies (e.g. 100)
  observationWindowDays: number; // e.g. 30 days
  warningRateBps: number; // 65 bps = 0.65%
  extraReserveRateBps: number; // 100 bps = 1.00%
  suspensionRateBps: number; // 150 bps = 1.50%
  extraReservePercentage: number; // e.g. 10.00%
  chargebackFeeUsd: Money; // e.g. $25.0000 USD
  returnPlatformFeeOnRefund: boolean; // default false
  updatedBy?: string | undefined;
  updatedAt: string;
}

export interface MerchantChargebackEvaluation {
  companyId: string;
  tenantId: string;
  totalTransactions: number;
  totalChargebacks: number;
  chargebackRateBps: number;
  chargebackRatePercentage: number;
  status: ChargebackEnforcementStatus;
  extraReserveRate: number;
  isSuspended: boolean;
  actionRequired: string;
  evaluationTimestamp: string;
}

export interface ChargebackLossDeduction {
  companyId: string;
  tenantId: string;
  disputeAmount: Money;
  chargebackFee: Money;
  totalDeducted: Money;
  currency: 'USD';
  debitedAt: string;
}

export const DEFAULT_CHARGEBACK_POLICY: Omit<ChargebackThresholdPolicy, 'tenantId' | 'updatedAt'> = {
  minTransactionCount: 100,
  observationWindowDays: 30,
  warningRateBps: 65, // 0.65%
  extraReserveRateBps: 100, // 1.00%
  suspensionRateBps: 150, // 1.50%
  extraReservePercentage: 10.0, // 10.0%
  chargebackFeeUsd: Money.from('25.0000'),
  returnPlatformFeeOnRefund: false,
};

const policyStore = new Map<string, ChargebackThresholdPolicy>();
const auditRepo = new AuditLogRepository();

/**
 * Retrieves the chargeback threshold policy for a tenant.
 */
export function getChargebackThresholdPolicy(tenantId: string): ChargebackThresholdPolicy {
  const existing = policyStore.get(tenantId);
  if (existing) {
    return existing;
  }

  const defaultPolicy: ChargebackThresholdPolicy = {
    ...DEFAULT_CHARGEBACK_POLICY,
    tenantId,
    updatedAt: new Date().toISOString(),
  };

  policyStore.set(tenantId, defaultPolicy);
  return defaultPolicy;
}

/**
 * Step 141.1: Super Admin Configuration for Chargeback Thresholds, Fees & Refund Rules.
 * Only super_admin has authority to update chargeback thresholds and fees.
 */
export async function updateChargebackThresholdPolicy(
  input: {
    tenantId: string;
    updaterRole: string;
    updaterId: string;
    minTransactionCount?: number | undefined;
    observationWindowDays?: number | undefined;
    warningRateBps?: number | undefined;
    extraReserveRateBps?: number | undefined;
    suspensionRateBps?: number | undefined;
    extraReservePercentage?: number | undefined;
    chargebackFeeUsd?: Money | undefined;
    returnPlatformFeeOnRefund?: boolean | undefined;
  }
): Promise<ChargebackThresholdPolicy> {
  if (input.updaterRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can configure chargeback threshold policies and fees.');
  }

  const current = getChargebackThresholdPolicy(input.tenantId);

  const newWarning = input.warningRateBps ?? current.warningRateBps;
  const newExtraReserve = input.extraReserveRateBps ?? current.extraReserveRateBps;
  const newSuspension = input.suspensionRateBps ?? current.suspensionRateBps;

  if (newWarning >= newExtraReserve || newExtraReserve >= newSuspension) {
    throw new Error(
      `Invalid threshold hierarchy: Warning (${newWarning} bps) must be < Extra Reserve (${newExtraReserve} bps) < Suspension (${newSuspension} bps).`
    );
  }

  const updated: ChargebackThresholdPolicy = {
    ...current,
    minTransactionCount: input.minTransactionCount ?? current.minTransactionCount,
    observationWindowDays: input.observationWindowDays ?? current.observationWindowDays,
    warningRateBps: newWarning,
    extraReserveRateBps: newExtraReserve,
    suspensionRateBps: newSuspension,
    extraReservePercentage: input.extraReservePercentage ?? current.extraReservePercentage,
    chargebackFeeUsd: input.chargebackFeeUsd ?? current.chargebackFeeUsd,
    returnPlatformFeeOnRefund: input.returnPlatformFeeOnRefund ?? current.returnPlatformFeeOnRefund,
    updatedBy: input.updaterId,
    updatedAt: new Date().toISOString(),
  };

  policyStore.set(input.tenantId, updated);

  logger.info('Chargeback threshold policy updated by super_admin', {
    tenantId: input.tenantId,
    updaterId: input.updaterId,
    warningRateBps: updated.warningRateBps,
    extraReserveRateBps: updated.extraReserveRateBps,
    suspensionRateBps: updated.suspensionRateBps,
    chargebackFeeUsd: updated.chargebackFeeUsd.toNumericString(),
  });

  try {
    await auditRepo.append({
      actor_id: input.updaterId,
      action: 'CHARGEBACK_POLICY_UPDATED',
      entity_type: 'chargeback_policy',
      entity_id: input.tenantId,
      payload: {
        tenantId: input.tenantId,
        minTransactionCount: updated.minTransactionCount,
        warningRateBps: updated.warningRateBps,
        extraReserveRateBps: updated.extraReserveRateBps,
        suspensionRateBps: updated.suspensionRateBps,
        extraReservePercentage: updated.extraReservePercentage,
        chargebackFeeUsd: updated.chargebackFeeUsd.toNumericString(),
        returnPlatformFeeOnRefund: updated.returnPlatformFeeOnRefund,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for chargeback policy update', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return updated;
}

/**
 * Step 141.2: Graduated Chargeback Status Evaluator.
 * Follows international card network rules:
 * - Rate and transaction count are BOTH considered.
 * - Minimum transaction count must be reached before percentage thresholds apply.
 * - Actions are graduated: normal -> warning & monitoring -> extra reserve -> suspension.
 */
export function evaluateMerchantChargebackMetrics(input: {
  companyId: string;
  tenantId: string;
  totalTransactions: number;
  totalChargebacks: number;
  policy?: ChargebackThresholdPolicy | undefined;
}): MerchantChargebackEvaluation {
  const policy = input.policy ?? getChargebackThresholdPolicy(input.tenantId);
  const now = new Date().toISOString();

  // If transaction count is 0 or less than minimum sample size, rate threshold does not apply
  if (input.totalTransactions < policy.minTransactionCount) {
    const rateBps = input.totalTransactions > 0
      ? Math.round((input.totalChargebacks * 10000) / input.totalTransactions)
      : 0;

    return {
      companyId: input.companyId,
      tenantId: input.tenantId,
      totalTransactions: input.totalTransactions,
      totalChargebacks: input.totalChargebacks,
      chargebackRateBps: rateBps,
      chargebackRatePercentage: Number((rateBps / 100).toFixed(2)),
      status: 'normal',
      extraReserveRate: 0.0,
      isSuspended: false,
      actionRequired: `Sample volume (${input.totalTransactions} transactions) is below card network minimum threshold (${policy.minTransactionCount}). Monitoring active without punitive action.`,
      evaluationTimestamp: now,
    };
  }

  // Calculate rate in basis points (e.g. 1 chargeback in 100 tx = 100 bps = 1.00%)
  const rateBps = Math.round(
    (input.totalChargebacks * 10000) / input.totalTransactions
  );
  const ratePercentage = Number((rateBps / 100).toFixed(2));

  let status: ChargebackEnforcementStatus = 'normal';
  let extraReserveRate = 0.0;
  let isSuspended = false;
  let actionRequired = 'Merchant chargeback rate is within healthy card network parameters.';

  if (rateBps >= policy.suspensionRateBps) {
    status = 'suspended';
    isSuspended = true;
    extraReserveRate = policy.extraReservePercentage;
    actionRequired = `CRITICAL: Chargeback rate (${ratePercentage}%) exceeded suspension threshold (${policy.suspensionRateBps / 100}%). Payment processing suspended at once.`;
  } else if (rateBps >= policy.extraReserveRateBps) {
    status = 'extra_reserve';
    extraReserveRate = policy.extraReservePercentage;
    actionRequired = `EXCESSIVE: Chargeback rate (${ratePercentage}%) exceeded excessive dispute threshold (${policy.extraReserveRateBps / 100}%). Added rolling reserve of ${policy.extraReservePercentage}% imposed.`;
  } else if (rateBps >= policy.warningRateBps) {
    status = 'warning';
    actionRequired = `WARNING: Chargeback rate (${ratePercentage}%) exceeded monitoring threshold (${policy.warningRateBps / 100}%). Merchant placed under graduated warning and remediation monitoring.`;
  }

  return {
    companyId: input.companyId,
    tenantId: input.tenantId,
    totalTransactions: input.totalTransactions,
    totalChargebacks: input.totalChargebacks,
    chargebackRateBps: rateBps,
    chargebackRatePercentage: ratePercentage,
    status,
    extraReserveRate,
    isSuspended,
    actionRequired,
    evaluationTimestamp: now,
  };
}

/**
 * Step 141.3: Chargeback Loss & Fee Sub-Merchant Balance Deduction Engine.
 * Rule: "The chargeback fee amount is set by super_admin and chargeback losses are taken from the sub-merchant balance."
 */
export async function deductChargebackLossAndFee(input: {
  companyId: string;
  tenantId: string;
  disputeAmount: Money;
  policy?: ChargebackThresholdPolicy | undefined;
}): Promise<ChargebackLossDeduction> {
  const policy = input.policy ?? getChargebackThresholdPolicy(input.tenantId);
  const chargebackFee = policy.chargebackFeeUsd;
  const totalDeducted = input.disputeAmount.add(chargebackFee);
  const debitedAt = new Date().toISOString();

  logger.warn('Deducting chargeback dispute loss and fee from sub-merchant balance', {
    companyId: input.companyId,
    tenantId: input.tenantId,
    disputeAmount: input.disputeAmount.toNumericString(),
    chargebackFee: chargebackFee.toNumericString(),
    totalDeducted: totalDeducted.toNumericString(),
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'CHARGEBACK_LOSS_AND_FEE_DEBITED',
      entity_type: 'submerchant_balance',
      entity_id: input.companyId,
      payload: {
        companyId: input.companyId,
        disputeAmount: input.disputeAmount.toNumericString(),
        chargebackFee: chargebackFee.toNumericString(),
        totalDeducted: totalDeducted.toNumericString(),
        currency: 'USD',
        debitedAt,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for chargeback deduction', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    companyId: input.companyId,
    tenantId: input.tenantId,
    disputeAmount: input.disputeAmount,
    chargebackFee,
    totalDeducted,
    currency: 'USD',
    debitedAt,
  };
}

/**
 * Resets the in-memory policy store for test isolation.
 */
export function resetChargebackPolicyStore(): void {
  policyStore.clear();
}
