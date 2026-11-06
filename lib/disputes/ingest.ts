// path: lib/disputes/ingest.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { Money } from '@/lib/money/money';

export type PaymentGatewayType = 'stripe' | 'nmi' | 'rainforest' | 'airwallex' | 'payoneer';

export type StandardDisputeReasonCategory =
  | 'fraud'
  | 'unrecognized'
  | 'product_not_received'
  | 'product_unacceptable'
  | 'duplicate_processing'
  | 'credit_not_processed'
  | 'general';

export interface IngestedDisputeRecord {
  id: string;
  tenantId: string;
  companyId: string;
  paymentId: string;
  gateway: PaymentGatewayType;
  gatewayDisputeId: string;
  amountUsd: string;
  currency: string;
  cardScheme: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';
  rawReasonCode: string;
  standardCategory: StandardDisputeReasonCategory;
  humanReadableReason: string;
  merchantTimezone: string;
  deadlineHours: 24 | 48;
  deadlineAt: string;
  isAmountFrozen: boolean;
  status: 'needs_response' | 'under_review' | 'evidence_submitted' | 'won' | 'lost';
  createdAt: string;
  updatedAt: string;
}

const ingestedDisputesStore = new Map<string, IngestedDisputeRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 203.2: Card scheme dispute reason code normalizer.
 * Maps Visa, Mastercard, Amex, Discover reason codes to standardized categories and descriptions.
 */
export function normalizeSchemeReasonCode(params: {
  cardScheme: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';
  rawCode: string;
}): { category: StandardDisputeReasonCategory; description: string } {
  const code = params.rawCode.toUpperCase().trim();

  // Visa Reason Codes (Claims Resolution VCR)
  if (params.cardScheme === 'visa') {
    if (code === '10.4' || code === '10.5' || code === 'FRAUD') {
      return { category: 'fraud', description: 'Visa 10.4: Other Fraud - Card-Absent Environment' };
    }
    if (code === '13.1') {
      return { category: 'product_not_received', description: 'Visa 13.1: Merchandise/Services Not Received' };
    }
    if (code === '13.3') {
      return { category: 'product_unacceptable', description: 'Visa 13.3: Defective or Not as Described' };
    }
    if (code === '12.6' || code === '12.5') {
      return { category: 'duplicate_processing', description: 'Visa 12.6: Duplicate Processing/Paid by Other Means' };
    }
  }

  // Mastercard Reason Codes
  if (params.cardScheme === 'mastercard') {
    if (code === '4837' || code === '4863') {
      return { category: 'fraud', description: 'Mastercard 4837: No Cardholder Authorization' };
    }
    if (code === '4853') {
      return { category: 'product_not_received', description: 'Mastercard 4853: Cardholder Dispute / Goods Not Provided' };
    }
    if (code === '4834') {
      return { category: 'duplicate_processing', description: 'Mastercard 4834: Point of Interaction Error / Duplicate' };
    }
  }

  // Amex Reason Codes
  if (params.cardScheme === 'amex') {
    if (code === 'F29' || code === 'FR2') {
      return { category: 'fraud', description: 'Amex F29: Fraudulent Full In-Card Transaction' };
    }
    if (code === 'C08' || code === 'C28') {
      return { category: 'product_not_received', description: 'Amex C08: Goods/Services Not Received' };
    }
  }

  // Generic / Default fallback
  return {
    category: 'general',
    description: `Card Scheme Dispute Code: ${params.rawCode || 'General Inquiry'}`,
  };
}

/**
 * Step 203.1 & 203.3: Ingests multi-gateway chargeback webhook, opening dispute and freezing funds.
 */
export async function ingestGatewayDisputeWebhook(input: {
  tenantId: string;
  companyId: string;
  paymentId: string;
  gateway: PaymentGatewayType;
  gatewayDisputeId: string;
  amountUsd: string | number;
  currency?: string | undefined;
  cardScheme?: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown' | undefined;
  rawReasonCode: string;
  merchantTimezone?: string | undefined;
  slaHoursConfigured?: 24 | 48 | undefined;
}): Promise<IngestedDisputeRecord> {
  const scheme = input.cardScheme ?? 'visa';
  const { category, description } = normalizeSchemeReasonCode({
    cardScheme: scheme,
    rawCode: input.rawReasonCode,
  });

  const id = generateUuidV7();
  const now = new Date();
  const slaHours = input.slaHoursConfigured ?? 24;
  const deadlineAt = new Date(now.getTime() + slaHours * 60 * 60 * 1000).toISOString();
  const amountStr = Number(input.amountUsd).toFixed(4);

  const record: IngestedDisputeRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    paymentId: input.paymentId,
    gateway: input.gateway,
    gatewayDisputeId: input.gatewayDisputeId,
    amountUsd: amountStr,
    currency: input.currency ?? 'USD',
    cardScheme: scheme,
    rawReasonCode: input.rawReasonCode,
    standardCategory: category,
    humanReadableReason: description,
    merchantTimezone: input.merchantTimezone ?? 'UTC',
    deadlineHours: slaHours,
    deadlineAt,
    isAmountFrozen: true, // Step 203.3: Funds immediately frozen from merchant balance/reserve
    status: 'needs_response',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  ingestedDisputesStore.set(id, record);

  logger.warn('Dispute webhook ingested: Funds frozen, merchant response timer started', {
    disputeId: id,
    companyId: input.companyId,
    amountUsd: amountStr,
    category,
    deadlineHours: slaHours,
    deadlineAt,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'DISPUTE_INGESTED_FUNDS_FROZEN',
      entity_type: 'payment_dispute',
      entity_id: id,
      payload: {
        gateway: input.gateway,
        gatewayDisputeId: input.gatewayDisputeId,
        paymentId: input.paymentId,
        amountUsd: amountStr,
        reasonCategory: category,
        deadlineAt,
      },
    });
  } catch {}

  return record;
}

export function getIngestedDispute(disputeId: string): IngestedDisputeRecord | null {
  return ingestedDisputesStore.get(disputeId) ?? null;
}

export function resetIngestedDisputesStore(): void {
  ingestedDisputesStore.clear();
}
