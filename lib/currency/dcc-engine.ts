// path: lib/currency/dcc-engine.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { getEffectiveFxRate } from '@/lib/currency/fx-engine';
import { SUPPORTED_CURRENCIES } from '@/lib/currency/currency-engine';

export interface DccQuoteRecord {
  id: string;
  tenantId: string;
  paymentIntentId: string;
  merchantAmount: number; // In USD
  merchantCurrency: 'USD';
  cardholderCurrency: string;
  midMarketRate: number;
  marginPercent: number;
  customerRate: number;
  cardholderAmount: number;
  markupAmountUsd: number;
  disclosureStatement: string;
  isAccepted: boolean | null;
  expiresAt: string; // ISO string (10 min TTL)
  decidedAt?: string | undefined;
  createdAt: string;
}

export interface DccOfferResult {
  eligibleForDcc: boolean;
  quote?: DccQuoteRecord | undefined;
  reason?: string | undefined;
}

export interface DccDecisionResult {
  quoteId: string;
  isAccepted: boolean;
  chargedCurrency: string;
  chargedAmount: number;
  settledUsdAmount: number;
  decidedAt: string;
}

const dccQuotesStore = new Map<string, DccQuoteRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 171.1: Generates Dynamic Currency Conversion (DCC) quote at checkout.
 * Section 28: "Dynamic currency conversion (DCC) at checkout with transparent markup display."
 */
export async function generateDccQuote(input: {
  tenantId: string;
  paymentIntentId: string;
  merchantAmountUsd: number;
  cardholderCurrency: string;
  nowIso?: string | undefined;
}): Promise<DccOfferResult> {
  const targetCurr = input.cardholderCurrency.toUpperCase();

  // If card currency is same as merchant currency (USD), DCC is not applicable
  if (targetCurr === 'USD') {
    return {
      eligibleForDcc: false,
      reason: 'Cardholder currency matches merchant base currency (USD).',
    };
  }

  const currMeta = SUPPORTED_CURRENCIES[targetCurr];
  if (!currMeta) {
    return {
      eligibleForDcc: false,
      reason: `Unsupported cardholder currency: ${targetCurr}`,
    };
  }

  // Retrieve effective exchange rate
  const rateRecord = getEffectiveFxRate(input.tenantId, targetCurr);
  if (!rateRecord) {
    return {
      eligibleForDcc: false,
      reason: `No active exchange rate found for USD to ${targetCurr}.`,
    };
  }

  const now = input.nowIso ?? new Date().toISOString();
  // 10-minute lock TTL
  const expiresAt = new Date(new Date(now).getTime() + 10 * 60 * 1000).toISOString();

  // Calculate cardholder amount with precision
  const rawCardholderAmount = input.merchantAmountUsd * rateRecord.customerRate;
  const factor = Math.pow(10, currMeta.decimals);
  const cardholderAmount = Number((Math.round(rawCardholderAmount * factor) / factor).toFixed(currMeta.decimals));

  // Transparent markup amount
  const rawMidMarketCardAmount = input.merchantAmountUsd * rateRecord.midMarketRate;
  const rawMidMarketInUsd = rawMidMarketCardAmount / rateRecord.midMarketRate; // input.merchantAmountUsd
  const markupAmountUsd = Number(
    (input.merchantAmountUsd * (rateRecord.marginPercent / 100)).toFixed(4)
  );

  const quoteId = generateUuidV7();
  const disclosureStatement = `1 USD = ${rateRecord.customerRate.toFixed(6)} ${targetCurr} (includes ${rateRecord.marginPercent.toFixed(2)}% conversion fee; mid-market rate: ${rateRecord.midMarketRate.toFixed(6)} ${targetCurr})`;

  const quote: DccQuoteRecord = {
    id: quoteId,
    tenantId: input.tenantId,
    paymentIntentId: input.paymentIntentId,
    merchantAmount: input.merchantAmountUsd,
    merchantCurrency: 'USD',
    cardholderCurrency: targetCurr,
    midMarketRate: rateRecord.midMarketRate,
    marginPercent: rateRecord.marginPercent,
    customerRate: rateRecord.customerRate,
    cardholderAmount,
    markupAmountUsd,
    disclosureStatement,
    isAccepted: null,
    expiresAt,
    createdAt: now,
  };

  dccQuotesStore.set(quoteId, quote);

  logger.info('DCC checkout quote generated', {
    quoteId,
    targetCurrency: targetCurr,
    merchantAmountUsd: input.merchantAmountUsd,
    cardholderAmount,
    customerRate: rateRecord.customerRate,
  });

  return {
    eligibleForDcc: true,
    quote,
  };
}

/**
 * Step 171.2: Processes cardholder's explicit DCC choice (Accepted vs Declined).
 */
export async function decideDccOffer(input: {
  quoteId: string;
  acceptDcc: boolean;
  nowIso?: string | undefined;
}): Promise<DccDecisionResult> {
  const quote = dccQuotesStore.get(input.quoteId);
  if (!quote) {
    throw new Error(`DCC quote '${input.quoteId}' was not found.`);
  }

  const now = input.nowIso ?? new Date().toISOString();
  if (now > quote.expiresAt) {
    throw new Error(`DCC quote '${input.quoteId}' has expired.`);
  }

  quote.isAccepted = input.acceptDcc;
  quote.decidedAt = now;

  let chargedCurrency: string;
  let chargedAmount: number;

  if (input.acceptDcc) {
    // Charged in buyer's local card currency
    chargedCurrency = quote.cardholderCurrency;
    chargedAmount = quote.cardholderAmount;
  } else {
    // Charged in merchant base currency
    chargedCurrency = quote.merchantCurrency;
    chargedAmount = quote.merchantAmount;
  }

  logger.info('Cardholder DCC choice recorded', {
    quoteId: quote.id,
    isAccepted: input.acceptDcc,
    chargedCurrency,
    chargedAmount,
    settledUsdAmount: quote.merchantAmount,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'DCC_OFFER_DECIDED',
      entity_type: 'dcc_quote',
      entity_id: quote.id,
      payload: {
        isAccepted: input.acceptDcc,
        chargedCurrency,
        chargedAmount,
        settledUsdAmount: quote.merchantAmount,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log DCC decision', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    quoteId: quote.id,
    isAccepted: input.acceptDcc,
    chargedCurrency,
    chargedAmount,
    settledUsdAmount: quote.merchantAmount,
    decidedAt: now,
  };
}

/**
 * Test helpers.
 */
export function getDccQuote(quoteId: string): DccQuoteRecord | undefined {
  return dccQuotesStore.get(quoteId);
}

export function resetDccStore(): void {
  dccQuotesStore.clear();
}
