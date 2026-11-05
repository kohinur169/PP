// path: lib/currency/cross-border-fees.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type SupportedCardBrand =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'unionpay'
  | 'jcb'
  | 'unknown';

export interface FeeCalculationInput {
  tenantId: string;
  paymentId: string;
  grossAmountUsd: number;
  cardBrand: SupportedCardBrand;
  cardCountry: string; // ISO 3166-1 alpha-2, e.g. "US", "GB", "CA", "SG"
  merchantCountry?: string | undefined; // Default "US"
  transactionCurrency?: string | undefined; // Default "USD"
  merchantCurrency?: string | undefined; // Default "USD"
  customBaseRate?: number | undefined; // Default 0.029 (2.9%)
  customFixedFeeUsd?: number | undefined; // Default 0.30 ($0.30)
}

export interface TransactionFeeBreakdown {
  id: string;
  tenantId: string;
  paymentId: string;
  grossAmountUsd: number;
  isCrossBorder: boolean;
  isCrossCurrency: boolean;
  cardBrand: SupportedCardBrand;
  cardCountry: string;
  merchantCountry: string;
  baseFeeUsd: number;
  crossBorderAssessmentUsd: number;
  currencyConversionAssessmentUsd: number;
  interchangePlusUsd: number;
  amexSurchargeUsd: number;
  totalProcessorFeeUsd: number;
  netAmountUsd: number;
  effectiveFeeRatePct: number;
  createdAt: string;
}

const feeBreakdownsStore = new Map<string, TransactionFeeBreakdown>();
const auditRepo = new AuditLogRepository();

/**
 * Section 28 & Section 12: Cross-border payment fee calculation rules:
 * - Domestic: cardCountry === merchantCountry. Cross-border fee: 0 bps.
 * - Cross-Border Single Currency: cardCountry !== merchantCountry && curr === merchantCurr.
 *   Card brand assessment: 0.40% (40 bps).
 * - Cross-Border Multi-Currency: cardCountry !== merchantCountry && curr !== merchantCurr.
 *   Card brand assessment: 0.40% + 0.80% conversion assessment = 1.20% (120 bps).
 * - Amex Surcharge: 0.50% (50 bps).
 */
export async function calculateTransactionFeeBreakdown(
  input: FeeCalculationInput
): Promise<TransactionFeeBreakdown> {
  const merchantCountry = (input.merchantCountry ?? 'US').toUpperCase();
  const cardCountry = input.cardCountry.toUpperCase();
  const merchantCurr = (input.merchantCurrency ?? 'USD').toUpperCase();
  const txCurr = (input.transactionCurrency ?? 'USD').toUpperCase();

  const isCrossBorder = cardCountry !== merchantCountry;
  const isCrossCurrency = isCrossBorder && txCurr !== merchantCurr;

  const baseRate = input.customBaseRate ?? 0.029; // 2.9%
  const fixedFeeUsd = input.customFixedFeeUsd ?? 0.30; // $0.30

  // 1. Base Gateway Fee: gross * baseRate + fixedFee
  const rawBaseFee = input.grossAmountUsd * baseRate + fixedFeeUsd;
  const baseFeeUsd = Number(rawBaseFee.toFixed(4));

  // 2. Cross-Border Assessment Fee (0.40% / 40 bps for international cards)
  const crossBorderRate = isCrossBorder ? 0.004 : 0.0;
  const crossBorderAssessmentUsd = Number((input.grossAmountUsd * crossBorderRate).toFixed(4));

  // 3. Currency Conversion Assessment Fee (0.80% / 80 bps for cross-currency international cards)
  const conversionRate = isCrossCurrency ? 0.008 : 0.0;
  const currencyConversionAssessmentUsd = Number((input.grossAmountUsd * conversionRate).toFixed(4));

  // 4. Amex Surcharge (0.50% / 50 bps)
  const amexRate = input.cardBrand === 'amex' ? 0.005 : 0.0;
  const amexSurchargeUsd = Number((input.grossAmountUsd * amexRate).toFixed(4));

  // 5. Interchange Plus Estimate
  // Domestic: 1.50% + $0.10. Cross-border: 2.20% (single curr) or 2.50% (multi curr) + $0.15
  const interchangeRate = !isCrossBorder ? 0.015 : isCrossCurrency ? 0.025 : 0.022;
  const interchangeFixed = !isCrossBorder ? 0.10 : 0.15;
  const interchangePlusUsd = Number(
    (input.grossAmountUsd * interchangeRate + interchangeFixed).toFixed(4)
  );

  // Total Processor Fee
  const totalProcessorFeeUsd = Number(
    (
      baseFeeUsd +
      crossBorderAssessmentUsd +
      currencyConversionAssessmentUsd +
      amexSurchargeUsd
    ).toFixed(4)
  );

  // Net Amount to Merchant
  const netAmountUsd = Number((input.grossAmountUsd - totalProcessorFeeUsd).toFixed(4));

  // Effective fee percentage rate
  const effectiveFeeRatePct =
    input.grossAmountUsd > 0
      ? Number(((totalProcessorFeeUsd / input.grossAmountUsd) * 100).toFixed(2))
      : 0.0;

  const id = generateUuidV7();
  const now = new Date().toISOString();

  const breakdown: TransactionFeeBreakdown = {
    id,
    tenantId: input.tenantId,
    paymentId: input.paymentId,
    grossAmountUsd: input.grossAmountUsd,
    isCrossBorder,
    isCrossCurrency,
    cardBrand: input.cardBrand,
    cardCountry,
    merchantCountry,
    baseFeeUsd,
    crossBorderAssessmentUsd,
    currencyConversionAssessmentUsd,
    interchangePlusUsd,
    amexSurchargeUsd,
    totalProcessorFeeUsd,
    netAmountUsd,
    effectiveFeeRatePct,
    createdAt: now,
  };

  feeBreakdownsStore.set(id, breakdown);

  logger.info('Cross-border transaction fee breakdown calculated', {
    paymentId: input.paymentId,
    grossUsd: input.grossAmountUsd,
    isCrossBorder,
    isCrossCurrency,
    totalProcessorFeeUsd,
    netAmountUsd,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'PAYMENT_FEE_BREAKDOWN_CALCULATED',
      entity_type: 'transaction_fee_breakdown',
      entity_id: id,
      payload: {
        paymentId: input.paymentId,
        grossAmountUsd: input.grossAmountUsd,
        isCrossBorder,
        isCrossCurrency,
        totalProcessorFeeUsd,
        netAmountUsd,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log fee breakdown', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return breakdown;
}

/**
 * Test helpers.
 */
export function getFeeBreakdown(id: string): TransactionFeeBreakdown | undefined {
  return feeBreakdownsStore.get(id);
}

export function resetFeeBreakdownsStore(): void {
  feeBreakdownsStore.clear();
}
