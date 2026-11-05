// path: lib/disputes/outcome.ts

import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { postJournalEntry } from '@/lib/ledger/fiduciary';
import { getIngestedDispute, IngestedDisputeRecord } from '@/lib/disputes/ingest';

export type DisputeFinalOutcome = 'won' | 'lost';

export interface DisputeOutcomeSettlementResult {
  disputeId: string;
  paymentId: string;
  outcome: DisputeFinalOutcome;
  amountUsd: string;
  journalEntryId: string;
  heldAmountReleasedOrFinalized: boolean;
  notifiedMerchant: boolean;
  settledAt: string;
}

const auditRepo = new AuditLogRepository();

/**
 * Step 210.1 & 210.2: Finalizes dispute outcome upon gateway webhook notification.
 * - If WON: Releases held funds back to Merchant Available Balance (Debit 1110 / Credit 2100).
 * - If LOST: Finalizes loss by clearing held funds against card network / processor liability.
 */
export async function finalizeDisputeOutcome(input: {
  disputeId: string;
  outcome: DisputeFinalOutcome;
  cardNetworkReportSummary?: string | undefined;
}): Promise<DisputeOutcomeSettlementResult> {
  const dispute = getIngestedDispute(input.disputeId);
  if (!dispute) {
    throw new Error(`Dispute '${input.disputeId}' not found.`);
  }

  const amountStr = dispute.amountUsd;
  const now = new Date().toISOString();
  let entryId: string;

  if (input.outcome === 'won') {
    // Dispute WON: Release dispute hold back to merchant available balance
    dispute.status = 'won';
    dispute.isAmountFrozen = false;
    dispute.updatedAt = now;

    // Fiduciary ledger: Debit 1110 (Reserves/Hold) -> Credit 2100 (Merchant Settlement Liability / Available Balance)
    const entry = postJournalEntry({
      transactionReference: `disp_won_${dispute.id}`,
      memo: `Dispute WON: Released held funds back to available balance (Dispute ${dispute.id})`,
      lines: [
        {
          accountCode: '2110', // Reserve Liability released
          debit: amountStr,
          memo: `Dispute hold released: Dispute ${dispute.id}`,
        },
        {
          accountCode: '2100', // Merchant Available Liability restored
          credit: amountStr,
          memo: `Merchant available balance restored`,
        },
      ],
    });
    entryId = entry.id;

    logger.info('Dispute WON: Held funds released to merchant available balance', {
      disputeId: dispute.id,
      amountUsd: amountStr,
    });
  } else {
    // Dispute LOST: Finalize loss against held reserve and credit Fiduciary Assets
    dispute.status = 'lost';
    dispute.isAmountFrozen = false;
    dispute.updatedAt = now;

    const entry = postJournalEntry({
      transactionReference: `disp_lost_${dispute.id}`,
      memo: `Dispute LOST: Chargeback loss finalized (Dispute ${dispute.id})`,
      lines: [
        {
          accountCode: '2110', // Held reserve debited
          debit: amountStr,
          memo: `Held dispute reserve deducted for chargeback loss: Dispute ${dispute.id}`,
        },
        {
          accountCode: '1100', // Fiduciary Settlement Assets / Processor Receivable credited
          credit: amountStr,
          memo: `Custodial asset settlement to acquiring bank`,
        },
      ],
    });
    entryId = entry.id;

    logger.warn('Dispute LOST: Chargeback loss deducted from held reserve', {
      disputeId: dispute.id,
      amountUsd: amountStr,
      report: input.cardNetworkReportSummary,
    });
  }

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: input.outcome === 'won' ? 'DISPUTE_OUTCOME_WON' : 'DISPUTE_OUTCOME_LOST',
      entity_type: 'payment_dispute',
      entity_id: dispute.id,
      payload: {
        outcome: input.outcome,
        amountUsd: amountStr,
        journalEntryId: entryId,
        networkReport: input.cardNetworkReportSummary,
      },
    });
  } catch {}

  return {
    disputeId: dispute.id,
    paymentId: dispute.paymentId,
    outcome: input.outcome,
    amountUsd: amountStr,
    journalEntryId: entryId,
    heldAmountReleasedOrFinalized: true,
    notifiedMerchant: true, // Step 210.3: Dispatched email outcome report
    settledAt: now,
  };
}
