// path: lib/payment/fee-refund-policy.ts

import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { postJournalEntry, PostJournalEntryInput } from '@/lib/ledger/fiduciary';

export type PlatformFeeRefundPolicy = 'return' | 'retain';

export interface CompanyFeeRefundSetting {
  companyId: string;
  policy: PlatformFeeRefundPolicy;
  updatedAt: string;
}

export interface RefundLedgerPostingResult {
  transactionId: string;
  totalDebitedFromMerchant: string;
  platformFeeReversed: string;
  policyApplied: PlatformFeeRefundPolicy;
}

// In-memory store for company fee policies (defaults to 'return' unless set by Super Admin)
const companyFeePolicyStore = new Map<string, PlatformFeeRefundPolicy>();
const auditRepo = new AuditLogRepository();

/**
 * Step 202.1: Configures Super Admin fee refund policy switch.
 */
export async function setCompanyFeeRefundPolicy(input: {
  companyId: string;
  policy: PlatformFeeRefundPolicy;
  actorId: string;
}): Promise<CompanyFeeRefundSetting> {
  companyFeePolicyStore.set(input.companyId, input.policy);
  const now = new Date().toISOString();

  logger.info('Company platform fee refund policy updated', {
    companyId: input.companyId,
    policy: input.policy,
    actorId: input.actorId,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorId,
      action: 'PLATFORM_FEE_REFUND_POLICY_UPDATED',
      entity_type: 'company_settings',
      entity_id: input.companyId,
      payload: {
        policy: input.policy,
      },
    });
  } catch {}

  return {
    companyId: input.companyId,
    policy: input.policy,
    updatedAt: now,
  };
}

export function getCompanyFeeRefundPolicy(companyId: string): PlatformFeeRefundPolicy {
  return companyFeePolicyStore.get(companyId) ?? 'return';
}

/**
 * Step 201.2 & Step 202.2 - 202.3: Reversible Double-Entry Ledger Posting for Refunds.
 * - If policy is 'return':
 *     Debit 2100 (Merchant Settlement Liabilities) by (RefundAmount - FeeAmount)
 *     Debit 4000 (Platform Fee Revenue) by FeeAmount
 *     Credit 1100 (Fiduciary Settlement Assets / Processor Receivable) by RefundAmount
 * - If policy is 'retain':
 *     Debit 2100 (Merchant Settlement Liabilities) by RefundAmount
 *     Credit 1100 (Fiduciary Settlement Assets / Processor Receivable) by RefundAmount
 *     Platform Fee Revenue (4000) remains untouched.
 */
export async function postRefundLedgerReversal(params: {
  tenantId: string;
  companyId: string;
  paymentId: string;
  refundId: string;
  refundAmountUsd: string;
  platformFeeUsd: string;
}): Promise<RefundLedgerPostingResult> {
  const policy = getCompanyFeeRefundPolicy(params.companyId);
  const refundAmount = Money.from(params.refundAmountUsd);
  const platformFee = Money.from(params.platformFeeUsd);

  let debitedFromMerchant: Money;
  let feeReversed: Money;

  type LedgerLineParam = {
    readonly accountCode: string;
    readonly debit?: string | number | Money | undefined;
    readonly credit?: string | number | Money | undefined;
    readonly memo?: string | undefined;
  };
  const lines: LedgerLineParam[] = [];

  if (policy === 'return') {
    debitedFromMerchant = refundAmount.subtract(platformFee);
    feeReversed = platformFee;

    // 1. Debit Merchant Liability by principal refund minus fee
    lines.push({
      accountCode: '2100', // Merchant Settlement Liabilities
      debit: debitedFromMerchant.toNumericString(),
      memo: `Refund reversal principal: Payment ${params.paymentId}`,
    });

    // 2. Debit Platform Fee Revenue (reverse fee earned back to merchant)
    lines.push({
      accountCode: '4000', // Platform Fee Revenue
      debit: feeReversed.toNumericString(),
      memo: `Platform fee refund reversal: Payment ${params.paymentId}`,
    });

    // 3. Credit Fiduciary Settlement Assets (funds returned to cardholder via processor)
    lines.push({
      accountCode: '1100', // Fiduciary Settlement Assets
      credit: refundAmount.toNumericString(),
      memo: `Cardholder refund payout: Refund ${params.refundId}`,
    });
  } else {
    // 'retain' policy: Platform fee retained by platform, merchant bears full refund amount
    debitedFromMerchant = refundAmount;
    feeReversed = Money.from('0.0000');

    // 1. Debit Merchant Liability by full refund
    lines.push({
      accountCode: '2100',
      debit: debitedFromMerchant.toNumericString(),
      memo: `Refund full deduction (fee retained): Payment ${params.paymentId}`,
    });

    // 2. Credit Fiduciary Settlement Assets
    lines.push({
      accountCode: '1100',
      credit: refundAmount.toNumericString(),
      memo: `Cardholder refund payout: Refund ${params.refundId}`,
    });
  }

  const tx = postJournalEntry({
    transactionReference: params.refundId,
    memo: `Refund reversal for payment ${params.paymentId} (Policy: ${policy})`,
    isFeeTransfer: true,
    lines,
  });

  logger.info('Refund double-entry ledger reversal posted', {
    transactionId: tx.id,
    companyId: params.companyId,
    refundId: params.refundId,
    policy,
    refundAmount: refundAmount.toNumericString(),
    feeReversed: feeReversed.toNumericString(),
  });

  return {
    transactionId: tx.id,
    totalDebitedFromMerchant: debitedFromMerchant.toNumericString(),
    platformFeeReversed: feeReversed.toNumericString(),
    policyApplied: policy,
  };
}

export function resetCompanyFeePolicyStore(): void {
  companyFeePolicyStore.clear();
}
