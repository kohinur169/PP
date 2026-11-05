// path: lib/jobs/settlement-release.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { postJournalEntry } from '@/lib/ledger/fiduciary';

export interface PendingSettlementItem {
  id: string;
  tenantId: string;
  companyId: string;
  paymentId: string;
  amountUsd: string;
  holdMaturesAt: string;
  isDeliveryTrackingVerified: boolean;
  hasActiveDisputeOrReview: boolean;
  isReleased: boolean;
}

export interface SettlementReleaseBatchResult {
  inspectedCount: number;
  releasedCount: number;
  blockedCount: number;
  totalReleasedUsd: string;
  executedAt: string;
}

const auditRepo = new AuditLogRepository();

/**
 * Step 244: Settlement Holding Period Release & Multi-Gate Verification Worker.
 * Releases funds to Available Balance only if holding period has elapsed AND delivery tracking is verified AND zero blocking disputes.
 */
export async function runDailySettlementReleaseWorker(
  items: PendingSettlementItem[],
  currentTime = new Date()
): Promise<SettlementReleaseBatchResult> {
  const nowMs = currentTime.getTime();
  let releasedCount = 0;
  let blockedCount = 0;
  let totalReleased = 0;

  for (const item of items) {
    const isMatured = new Date(item.holdMaturesAt).getTime() <= nowMs;
    const isGatePassed = item.isDeliveryTrackingVerified && !item.hasActiveDisputeOrReview;

    if (isMatured && isGatePassed && !item.isReleased) {
      item.isReleased = true;
      releasedCount++;
      totalReleased += Number(item.amountUsd);

      // Post ledger journal moving funds from Account 2110 (Reserves/Holds) to Account 2100 (Available Liabilities)
      postJournalEntry({
        transactionReference: `settle_rel_${item.id}`,
        memo: `Settlement release: Payment ${item.paymentId}`,
        lines: [
          {
            accountCode: '2110', // Reserve / Holding Liability
            debit: item.amountUsd,
            memo: `Held settlement released`,
          },
          {
            accountCode: '2100', // Merchant Available Liability
            credit: item.amountUsd,
            memo: `Merchant available payout balance credit`,
          },
        ],
      });
    } else {
      blockedCount++;
    }
  }

  const result: SettlementReleaseBatchResult = {
    inspectedCount: items.length,
    releasedCount,
    blockedCount,
    totalReleasedUsd: totalReleased.toFixed(4),
    executedAt: new Date().toISOString(),
  };

  logger.info('Daily settlement release worker executed', {
    released: releasedCount,
    blocked: blockedCount,
    totalUsd: result.totalReleasedUsd,
  });

  return result;
}
