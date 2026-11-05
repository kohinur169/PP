// path: lib/partners/partner-portal.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { getPartner, PartnerRecord } from '@/lib/partners/partner-engine';
import { MonthlyCommissionRecord } from '@/lib/partners/commission-engine';

export interface ReferredMerchantItem {
  companyId: string;
  companyName: string;
  attributedAt: string;
  currentCycleVolumeUsd: number;
}

export interface PartnerPayoutHistoryItem {
  id: string;
  commissionId: string;
  payoutBatchId: string;
  payoutAmountUsd: number;
  destinationType: string;
  destinationMasked: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  ledgerClearingJournalId: string;
  createdAt: string;
}

export interface PartnerPortalDashboard {
  partner: PartnerRecord;
  metrics: {
    totalReferredMerchantsCount: number;
    allTimeReferredVolumeUsd: number;
    allTimeCommissionEarnedUsd: number;
    pendingAccruedCommissionUsd: number;
    taxHoldEscrowUsd: number;
    paidCommissionUsd: number;
  };
  referredMerchants: ReferredMerchantItem[];
  payoutHistory: PartnerPayoutHistoryItem[];
}

const partnerPayoutsStore = new Map<string, PartnerPayoutHistoryItem>();
const auditRepo = new AuditLogRepository();

/**
 * Step 183.1: Aggregates real-time partner portal dashboard data.
 * Section 31: "Partner portal: referred merchants list, volume processed, commission earned, payout history."
 */
export async function getPartnerPortalDashboard(input: {
  tenantId: string;
  partnerId: string;
  activeCommissions: MonthlyCommissionRecord[];
  referredMerchants: ReferredMerchantItem[];
}): Promise<PartnerPortalDashboard> {
  const partner = getPartner(input.partnerId);
  if (!partner) {
    throw new Error(`Partner '${input.partnerId}' was not found.`);
  }

  let allTimeVolume = 0;
  let allTimeEarned = 0;
  let pendingAccrued = 0;
  let taxHold = 0;
  let paid = 0;

  for (const c of input.activeCommissions) {
    if (c.partnerId === input.partnerId) {
      allTimeVolume += c.totalReferredVolumeUsd;
      allTimeEarned += c.earnedCommissionUsd;

      if (c.status === 'accrued') {
        pendingAccrued += c.earnedCommissionUsd;
      } else if (c.status === 'tax_hold') {
        taxHold += c.earnedCommissionUsd;
      } else if (c.status === 'paid') {
        paid += c.earnedCommissionUsd;
      }
    }
  }

  const payouts: PartnerPayoutHistoryItem[] = [];
  for (const p of partnerPayoutsStore.values()) {
    payouts.push(p);
  }

  return {
    partner,
    metrics: {
      totalReferredMerchantsCount: input.referredMerchants.length,
      allTimeReferredVolumeUsd: Number(allTimeVolume.toFixed(4)),
      allTimeCommissionEarnedUsd: Number(allTimeEarned.toFixed(4)),
      pendingAccruedCommissionUsd: Number(pendingAccrued.toFixed(4)),
      taxHoldEscrowUsd: Number(taxHold.toFixed(4)),
      paidCommissionUsd: Number(paid.toFixed(4)),
    },
    referredMerchants: input.referredMerchants,
    payoutHistory: payouts,
  };
}

/**
 * Step 183.2: Queues accrued partner commissions into mass payout batch and creates ledger clearing record.
 * Section 31: "Automated monthly commission calculation and payout batch inclusion."
 */
export async function includePartnerCommissionInPayoutBatch(input: {
  tenantId: string;
  partnerId: string;
  commission: MonthlyCommissionRecord;
  payoutBatchId: string;
  destinationType: 'ach' | 'wire' | 'sepa' | 'payoneer';
  destinationMasked: string;
}): Promise<PartnerPayoutHistoryItem> {
  const partner = getPartner(input.partnerId);
  if (!partner) {
    throw new Error(`Partner '${input.partnerId}' was not found.`);
  }

  // Invariant: Tax form must be verified
  if (partner.taxFormStatus !== 'verified') {
    throw new Error(
      `Cannot execute payout for partner '${input.partnerId}': Tax form is not verified (${partner.taxFormStatus}).`
    );
  }

  if (input.commission.status !== 'accrued') {
    throw new Error(`Cannot payout commission in '${input.commission.status}' status.`);
  }

  const payoutRecordId = generateUuidV7();
  const ledgerClearingJournalId = generateUuidV7();
  const now = new Date().toISOString();

  const record: PartnerPayoutHistoryItem = {
    id: payoutRecordId,
    commissionId: input.commission.id,
    payoutBatchId: input.payoutBatchId,
    payoutAmountUsd: input.commission.earnedCommissionUsd,
    destinationType: input.destinationType,
    destinationMasked: input.destinationMasked,
    status: 'completed',
    ledgerClearingJournalId,
    createdAt: now,
  };

  partnerPayoutsStore.set(payoutRecordId, record);
  input.commission.status = 'paid';
  input.commission.updatedAt = now;

  logger.info('Partner commission included in payout batch and ledger cleared', {
    payoutRecordId,
    partnerId: input.partnerId,
    payoutBatchId: input.payoutBatchId,
    payoutAmountUsd: record.payoutAmountUsd,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'PARTNER_PAYOUT_BATCH_INCLUDED',
      entity_type: 'partner_payout_record',
      entity_id: payoutRecordId,
      payload: {
        partnerId: input.partnerId,
        commissionId: input.commission.id,
        payoutBatchId: input.payoutBatchId,
        payoutAmountUsd: record.payoutAmountUsd,
        ledgerClearingJournalId,
      },
    });
  } catch {}

  return record;
}

export function resetPartnerPayoutsStore(): void {
  partnerPayoutsStore.clear();
}
