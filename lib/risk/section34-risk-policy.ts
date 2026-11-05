// path: lib/risk/section34-risk-policy.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type UserRole = 'super_admin' | 'ceo' | 'compliance_officer' | 'finance_ops' | 'support' | 'merchant_admin';

export interface RiskPolicyProposal {
  id: string;
  tenantId: string;
  proposerId: string;
  approverId?: string | undefined;
  status: 'draft' | 'proposed' | 'approved' | 'rejected' | 'effective';
  policyType: string;
  parameters: Record<string, unknown>;
  effectiveDate: string;
  rejectionReason?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface Section34TierRules {
  tier: 1 | 2 | 3;
  singleTransactionCapUsd: number;
  monthlyVolumeCapUsd: number;
  rollingReservePct: number;
  rollingReserveDays: number;
  postFulfilmentDelayDays: number;
}

export const SECTION_34_TIER_RULES: Record<1 | 2 | 3, Section34TierRules> = {
  1: {
    tier: 1,
    singleTransactionCapUsd: 500,
    monthlyVolumeCapUsd: 2500,
    rollingReservePct: 10,
    rollingReserveDays: 90,
    postFulfilmentDelayDays: 7,
  },
  2: {
    tier: 2,
    singleTransactionCapUsd: 2500,
    monthlyVolumeCapUsd: 15000,
    rollingReservePct: 5,
    rollingReserveDays: 60,
    postFulfilmentDelayDays: 3,
  },
  3: {
    tier: 3,
    singleTransactionCapUsd: 10000,
    monthlyVolumeCapUsd: 50000,
    rollingReservePct: 5,
    rollingReserveDays: 30,
    postFulfilmentDelayDays: 2,
  },
};

export const PRE_CAPTURE_REVIEW_THRESHOLD_USD = 5000;

const riskProposalsStore = new Map<string, RiskPolicyProposal>();
const payoutExceptionsStore = new Map<string, {
  id: string;
  tenantId: string;
  companyId: string;
  evidence: string;
  complianceReason: string;
  approverId: string;
  approvedAt: string;
}>();
const auditRepo = new AuditLogRepository();

/**
 * Step 187.1: Proposes a versioned, effective-dated risk policy update (CEO or Super Admin only).
 * Section 34: "CEO and super_admin may change risk policy values through versioned, effective-dated, audited proposals..."
 */
export async function proposeRiskPolicyUpdate(input: {
  tenantId: string;
  proposerId: string;
  proposerRole: UserRole;
  policyType: string;
  parameters: Record<string, unknown>;
  effectiveDate: string;
}): Promise<RiskPolicyProposal> {
  if (input.proposerRole !== 'ceo' && input.proposerRole !== 'super_admin') {
    throw new Error(`Unauthorized: Only CEO and Super Admin can propose risk policy revisions (got '${input.proposerRole}').`);
  }

  const id = generateUuidV7();
  const now = new Date().toISOString();

  const proposal: RiskPolicyProposal = {
    id,
    tenantId: input.tenantId,
    proposerId: input.proposerId,
    status: 'proposed',
    policyType: input.policyType,
    parameters: input.parameters,
    effectiveDate: input.effectiveDate,
    createdAt: now,
    updatedAt: now,
  };

  riskProposalsStore.set(id, proposal);

  logger.info('Risk policy update proposed', {
    proposalId: id,
    policyType: input.policyType,
    proposerId: input.proposerId,
  });

  try {
    await auditRepo.append({
      actor_id: input.proposerId,
      action: 'RISK_POLICY_PROPOSED',
      entity_type: 'risk_policy_proposal',
      entity_id: id,
      payload: {
        policyType: input.policyType,
        parameters: input.parameters,
        effectiveDate: input.effectiveDate,
      },
    });
  } catch {}

  return proposal;
}

/**
 * Step 187.2: Approves a risk policy proposal enforcing Four-Eye dual-control principle.
 * Section 34: "...and approvals by distinct authorized actors."
 */
export async function approveRiskPolicyProposal(input: {
  tenantId: string;
  proposalId: string;
  approverId: string;
  approverRole: UserRole;
}): Promise<RiskPolicyProposal> {
  const proposal = riskProposalsStore.get(input.proposalId);
  if (!proposal) {
    throw new Error(`Risk policy proposal '${input.proposalId}' not found.`);
  }

  if (input.approverRole !== 'ceo' && input.approverRole !== 'super_admin') {
    throw new Error(`Unauthorized: Only CEO and Super Admin can approve risk policy updates (got '${input.approverRole}').`);
  }

  if (input.approverId === proposal.proposerId) {
    throw new Error('Four-Eye violation: Risk policy approver must be distinct from proposer.');
  }

  const now = new Date().toISOString();
  proposal.approverId = input.approverId;
  proposal.status = 'approved';
  proposal.updatedAt = now;

  logger.info('Risk policy proposal approved under dual-control', {
    proposalId: input.proposalId,
    approverId: input.approverId,
  });

  try {
    await auditRepo.append({
      actor_id: input.approverId,
      action: 'RISK_POLICY_APPROVED',
      entity_type: 'risk_policy_proposal',
      entity_id: input.proposalId,
      payload: {
        proposerId: proposal.proposerId,
        approverId: input.approverId,
        policyType: proposal.policyType,
      },
    });
  } catch {}

  return proposal;
}

/**
 * Step 187.3: Evaluates merchant eligibility for Section 34 Risk Tiers (Tiers 1, 2, 3).
 * Section 34: "All sellers start Tier 1... Tier 2: eligibility after 60 active days, 20 completed orders, chargeback rate below 0.3%, no fraud flags... Tier 3: eligibility after 180 active days, 100 completed orders, chargeback rate below 0.3% and current re-KYC..."
 */
export function evaluateMerchantRiskTierEligibility(input: {
  companyId: string;
  activeDays: number;
  completedOrdersCount: number;
  chargebackRatePct: number;
  hasFraudFlags: boolean;
  hasCurrentReKyc: boolean;
}): {
  eligibleTier: 1 | 2 | 3;
  rules: Section34TierRules;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check Tier 3 eligibility
  if (
    input.activeDays >= 180 &&
    input.completedOrdersCount >= 100 &&
    input.chargebackRatePct < 0.3 &&
    !input.hasFraudFlags &&
    input.hasCurrentReKyc
  ) {
    reasons.push('Eligible for Tier 3: >= 180 active days, >= 100 orders, chargeback < 0.3%, valid re-KYC.');
    return {
      eligibleTier: 3,
      rules: SECTION_34_TIER_RULES[3],
      reasons,
    };
  }

  // Check Tier 2 eligibility
  if (
    input.activeDays >= 60 &&
    input.completedOrdersCount >= 20 &&
    input.chargebackRatePct < 0.3 &&
    !input.hasFraudFlags
  ) {
    reasons.push('Eligible for Tier 2: >= 60 active days, >= 20 orders, chargeback < 0.3%, zero fraud flags.');
    return {
      eligibleTier: 2,
      rules: SECTION_34_TIER_RULES[2],
      reasons,
    };
  }

  // Default Tier 1
  reasons.push('Default Tier 1: New merchant or requirements for Tier 2/3 not yet satisfied.');
  return {
    eligibleTier: 1,
    rules: SECTION_34_TIER_RULES[1],
    reasons,
  };
}

/**
 * Step 187.4: Pre-Capture Review Gate (> USD 5,000 threshold at every tier).
 * Section 34: "A transaction above USD 5,000 requires manual review before capture at every tier. Capture remains blocked until approval."
 */
export function evaluatePreCaptureReviewGate(input: {
  companyId: string;
  amountUsd: number;
  riskTier: 1 | 2 | 3;
}): {
  requiresManualReview: boolean;
  isCaptureBlocked: boolean;
  status: 'cleared_for_capture' | 'blocked_pending_manual_review';
  reason?: string | undefined;
} {
  if (input.amountUsd > PRE_CAPTURE_REVIEW_THRESHOLD_USD) {
    return {
      requiresManualReview: true,
      isCaptureBlocked: true,
      status: 'blocked_pending_manual_review',
      reason: `Transaction of $${input.amountUsd.toFixed(2)} exceeds USD 5,000 threshold requiring manual review before capture at every tier.`,
    };
  }

  return {
    requiresManualReview: false,
    isCaptureBlocked: false,
    status: 'cleared_for_capture',
  };
}

/**
 * Step 187.5: Evaluates Section 34 Payout Eligibility with fulfilment delay and hold checks.
 * Section 34: "Payout requires verified delivery or buyer acceptance of service, the tier-specific post-fulfilment delay, provider verification, verified bank account, available balance and no applicable review/dispute/hold."
 */
export function evaluateSection34PayoutEligibility(input: {
  companyId: string;
  riskTier: 1 | 2 | 3;
  daysSinceFulfilment: number;
  hasDeliveryProof: boolean;
  isProviderVerified: boolean;
  isBankAccountVerified: boolean;
  availableBalanceUsd: number;
  hasDisputeOrHold: boolean;
}): {
  isEligible: boolean;
  blockReasons: string[];
} {
  const blockReasons: string[] = [];
  const rules = SECTION_34_TIER_RULES[input.riskTier];

  // Check post-fulfilment delay
  if (input.daysSinceFulfilment < rules.postFulfilmentDelayDays) {
    blockReasons.push(
      `Post-fulfilment delay not satisfied: requires at least ${rules.postFulfilmentDelayDays} days for Tier ${input.riskTier} (current: ${input.daysSinceFulfilment} days).`
    );
  }

  // Delivery proof check (or exception)
  const hasException = payoutExceptionsStore.has(input.companyId);
  if (!input.hasDeliveryProof && !hasException) {
    blockReasons.push('Missing verified delivery proof or buyer acceptance of service.');
  }

  if (!input.isProviderVerified) {
    blockReasons.push('Processor sub-merchant verification is incomplete.');
  }

  if (!input.isBankAccountVerified) {
    blockReasons.push('Merchant settlement bank account is not verified.');
  }

  if (input.availableBalanceUsd <= 0) {
    blockReasons.push('Available balance must be greater than zero.');
  }

  if (input.hasDisputeOrHold) {
    blockReasons.push('Account has an active dispute, compliance review, or administrative hold.');
  }

  return {
    isEligible: blockReasons.length === 0,
    blockReasons,
  };
}

/**
 * Approves a payout exception for missing fulfilment proof (CEO or Super Admin only).
 * Section 34: "Missing fulfilment proof keeps funds held; exceptions require evidence, a reason, authorized compliance decision and CEO/super_admin approval."
 */
export async function approvePayoutException(input: {
  tenantId: string;
  companyId: string;
  evidence: string;
  complianceReason: string;
  approverId: string;
  approverRole: UserRole;
}): Promise<{ id: string; status: string }> {
  if (input.approverRole !== 'ceo' && input.approverRole !== 'super_admin') {
    throw new Error(`Unauthorized: Only CEO and Super Admin can approve payout exceptions (got '${input.approverRole}').`);
  }

  const id = generateUuidV7();
  const now = new Date().toISOString();

  payoutExceptionsStore.set(input.companyId, {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    evidence: input.evidence,
    complianceReason: input.complianceReason,
    approverId: input.approverId,
    approvedAt: now,
  });

  logger.info('Payout exception authorized by executive', {
    companyId: input.companyId,
    approverId: input.approverId,
  });

  try {
    await auditRepo.append({
      actor_id: input.approverId,
      action: 'PAYOUT_EXCEPTION_APPROVED',
      entity_type: 'payout_exception',
      entity_id: id,
      payload: {
        companyId: input.companyId,
        evidence: input.evidence,
        complianceReason: input.complianceReason,
      },
    });
  } catch {}

  return { id, status: 'approved' };
}

export function resetSection34RiskPolicyStore(): void {
  riskProposalsStore.clear();
  payoutExceptionsStore.clear();
}
