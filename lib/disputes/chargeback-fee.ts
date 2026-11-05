// path: lib/disputes/chargeback-fee.ts

import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { postJournalEntry } from '@/lib/ledger/fiduciary';

export const DEFAULT_SUPER_ADMIN_CHARGEBACK_FEE_USD = '15.0000';

export interface ChargebackFeePostingResult {
  disputeId: string;
  feeAmountUsd: string;
  sourceAccountDebited: '2100' | '2110'; // 2100: Merchant Settlement Liabilities (Available), 2110: Reserves
  revenueAccountCredited: '4000';         // Corporate Revenue
  journalEntryId: string;
  postedAt: string;
}

const auditRepo = new AuditLogRepository();
let configuredPlatformDisputeFee = DEFAULT_SUPER_ADMIN_CHARGEBACK_FEE_USD;

export function configurePlatformChargebackFee(feeUsd: string): void {
  configuredPlatformDisputeFee = Number(feeUsd).toFixed(4);
}

export function getPlatformChargebackFee(): string {
  return configuredPlatformDisputeFee;
}

/**
 * Step 208.2 & 208.3: Debits chargeback dispute fee from merchant available balance (or reserve if deficient).
 */
export async function postChargebackFeeDeduction(params: {
  disputeId: string;
  companyId: string;
  tenantId: string;
  hasSufficientAvailableBalance?: boolean | undefined;
}): Promise<ChargebackFeePostingResult> {
  const feeMoney = Money.from(configuredPlatformDisputeFee);
  const feeStr = feeMoney.toNumericString();
  const isAvailableSufficient = params.hasSufficientAvailableBalance ?? true;

  // Account 2100 is Merchant Settlement Liabilities (available payout balance)
  // Account 2110 is Merchant Reserve Liabilities (withheld rolling reserve)
  const debitAccount = isAvailableSufficient ? '2100' : '2110';

  const entry = postJournalEntry({
    transactionReference: `cb_fee_${params.disputeId}`,
    memo: `Chargeback administrative processing fee: Dispute ${params.disputeId}`,
    isFeeTransfer: true,
    lines: [
      {
        accountCode: debitAccount,
        debit: feeStr,
        memo: `Chargeback fee deduction: Dispute ${params.disputeId}`,
      },
      {
        accountCode: '4000', // Corporate Platform Fee / Chargeback Revenue
        credit: feeStr,
        memo: `Dispute processing fee earned`,
      },
    ],
  });

  const now = new Date().toISOString();
  const result: ChargebackFeePostingResult = {
    disputeId: params.disputeId,
    feeAmountUsd: feeStr,
    sourceAccountDebited: debitAccount,
    revenueAccountCredited: '4000',
    journalEntryId: entry.id,
    postedAt: now,
  };

  logger.info('Chargeback fee posted to double-entry ledger', {
    disputeId: params.disputeId,
    feeAmountUsd: feeStr,
    sourceAccount: debitAccount,
    entryId: entry.id,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'CHARGEBACK_FEE_POSTED',
      entity_type: 'payment_dispute',
      entity_id: params.disputeId,
      payload: {
        feeAmountUsd: feeStr,
        debitedAccount: debitAccount,
        journalEntryId: entry.id,
      },
    });
  } catch {}

  return result;
}

export function resetPlatformChargebackFee(): void {
  configuredPlatformDisputeFee = DEFAULT_SUPER_ADMIN_CHARGEBACK_FEE_USD;
}
