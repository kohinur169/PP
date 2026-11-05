// path: lib/processors/fees.ts

import { Money } from '@/lib/money/money';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import type { PaymentProcessorSlug } from '@/types/processors';
import type { CardBrand } from '@/lib/processors/routing';

export type PaymentMethodType = 'card' | 'ach' | 'wallet' | 'payout';

export interface ProcessorFeeSchedule {
  id?: string | undefined;
  tenantId?: string | undefined;
  provider: PaymentProcessorSlug;
  paymentMethod: PaymentMethodType;
  percentageRate: string; // e.g. '0.029000' = 2.9%
  fixedFeeUsd: string; // e.g. '0.3000' = $0.3000 USD
  internationalSurchargeRate: string; // e.g. '0.010000' = +1.0%
  amexSurchargeRate: string; // e.g. '0.005000' = +0.5%
  isActive: boolean;
}

export interface CalculateFeeParams {
  amount: Money;
  provider: PaymentProcessorSlug;
  cardBrand?: CardBrand | undefined;
  paymentMethod?: PaymentMethodType | undefined;
  isInternational?: boolean | undefined;
  customSchedule?: Partial<ProcessorFeeSchedule> | undefined;
}

export interface ProcessorCostBreakdown {
  grossAmount: Money;
  percentageFee: Money;
  fixedFee: Money;
  internationalSurcharge: Money;
  amexSurcharge: Money;
  totalProcessorFee: Money;
  netSettlementAmount: Money;
  effectiveRatePercent: string;
  provider: PaymentProcessorSlug;
  isInternational: boolean;
}

export interface TransactionFeeDebitRecord {
  id: string;
  transactionId: string;
  provider: PaymentProcessorSlug;
  grossAmount: string;
  processorCost: string;
  platformFee: string;
  netMerchantPayout: string;
  recordedAt: string;
}

/**
 * Built-in default Interchange++ and blended fee models for all 5 platform processors.
 */
export const DEFAULT_FEE_SCHEDULES: Record<PaymentProcessorSlug, ProcessorFeeSchedule> = {
  // Stripe Connect: Blended 2.9% + $0.30, +1.5% international surcharge
  stripe_connect: {
    provider: 'stripe_connect',
    paymentMethod: 'card',
    percentageRate: '0.029000',
    fixedFeeUsd: '0.3000',
    internationalSurchargeRate: '0.015000',
    amexSurchargeRate: '0.000000',
    isActive: true,
  },
  // NMI: Direct MID interchange++ gateway tier 2.4% + $0.20, +1.0% international, +0.5% Amex
  nmi: {
    provider: 'nmi',
    paymentMethod: 'card',
    percentageRate: '0.024000',
    fixedFeeUsd: '0.2000',
    internationalSurchargeRate: '0.010000',
    amexSurchargeRate: '0.005000',
    isActive: true,
  },
  // Rainforest: Vertical PayFac embedded platform rate 2.7% + $0.25, +1.0% international
  rainforest: {
    provider: 'rainforest',
    paymentMethod: 'card',
    percentageRate: '0.027000',
    fixedFeeUsd: '0.2500',
    internationalSurchargeRate: '0.010000',
    amexSurchargeRate: '0.000000',
    isActive: true,
  },
  // Airwallex: Cross-border optimized acquiring 2.2% + $0.30, +0.8% cross-border
  airwallex: {
    provider: 'airwallex',
    paymentMethod: 'card',
    percentageRate: '0.022000',
    fixedFeeUsd: '0.3000',
    internationalSurchargeRate: '0.008000',
    amexSurchargeRate: '0.004000',
    isActive: true,
  },
  // Payoneer: Mass and cross-border commercial payouts 1.0% + $1.50 flat fee
  payoneer: {
    provider: 'payoneer',
    paymentMethod: 'payout',
    percentageRate: '0.010000',
    fixedFeeUsd: '1.5000',
    internationalSurchargeRate: '0.005000',
    amexSurchargeRate: '0.000000',
    isActive: true,
  },
};

// In-memory tenant fee schedule registry for custom merchant pricing
const tenantSchedules = new Map<string, ProcessorFeeSchedule>();

export function registerTenantFeeSchedule(
  tenantId: string,
  schedule: ProcessorFeeSchedule
): void {
  const key = `${tenantId}:${schedule.provider}:${schedule.paymentMethod}`;
  tenantSchedules.set(key, schedule);
}

export function clearTenantFeeSchedules(): void {
  tenantSchedules.clear();
}

/**
 * Calculates processor cost and fee breakdown for a transaction using exact
 * USD numeric(18,4) Decimal math with banker's rounding (ROUND_HALF_EVEN) (Step 129.2).
 */
export function calculateProcessorCost(
  params: CalculateFeeParams
): ProcessorCostBreakdown {
  if (params.amount.value.isNegative() || params.amount.value.isZero()) {
    throw new Error('Transaction amount must be strictly greater than zero for fee calculation.');
  }

  const defaultSchedule = DEFAULT_FEE_SCHEDULES[params.provider];
  const method = params.paymentMethod ?? 'card';

  const schedule: ProcessorFeeSchedule = {
    ...defaultSchedule,
    ...params.customSchedule,
    provider: params.provider,
    paymentMethod: method,
  };

  const isInternational = Boolean(params.isInternational);
  const isAmex = params.cardBrand === 'amex';

  // 1. Percentage Rate Fee: amount * percentageRate
  const percentageFee = params.amount.mul(schedule.percentageRate).round(4);

  // 2. Fixed Transaction Fee
  const fixedFee = Money.from(schedule.fixedFeeUsd).round(4);

  // 3. International / Cross-Border Surcharge
  const internationalSurcharge = isInternational
    ? params.amount.mul(schedule.internationalSurchargeRate).round(4)
    : Money.zero();

  // 4. Amex Card Brand Surcharge
  const amexSurcharge = isAmex
    ? params.amount.mul(schedule.amexSurchargeRate).round(4)
    : Money.zero();

  // 5. Total Processor Cost: sum of all fee components
  const totalProcessorFee = percentageFee
    .add(fixedFee)
    .add(internationalSurcharge)
    .add(amexSurcharge)
    .round(4);

  // 6. Net Settlement Amount: gross amount - processor cost
  const netSettlementAmount = params.amount.sub(totalProcessorFee).round(4);

  // 7. Effective Fee Percentage
  const effectiveRatio = totalProcessorFee.div(params.amount).mul(100);
  const effectiveRatePercent = `${effectiveRatio.value.toFixed(4)}%`;

  return {
    grossAmount: params.amount.round(4),
    percentageFee,
    fixedFee,
    internationalSurcharge,
    amexSurcharge,
    totalProcessorFee,
    netSettlementAmount,
    effectiveRatePercent,
    provider: params.provider,
    isInternational,
  };
}

/**
 * Records a processor fee debit against a transaction alongside platform fee deductions (Step 129.3).
 */
export function recordProcessorFeeDebit(params: {
  transactionId: string;
  grossAmount: Money;
  processorCost: Money;
  platformFee: Money;
  provider: PaymentProcessorSlug;
}): TransactionFeeDebitRecord {
  const netMerchantPayout = params.grossAmount
    .sub(params.processorCost)
    .sub(params.platformFee)
    .round(4);

  const record: TransactionFeeDebitRecord = {
    id: generateUuidV7(),
    transactionId: params.transactionId,
    provider: params.provider,
    grossAmount: params.grossAmount.toNumericString(),
    processorCost: params.processorCost.toNumericString(),
    platformFee: params.platformFee.toNumericString(),
    netMerchantPayout: netMerchantPayout.toNumericString(),
    recordedAt: new Date().toISOString(),
  };

  logger.info('Processor fee debit recorded for transaction', {
    transactionId: params.transactionId,
    provider: params.provider,
    processorCost: record.processorCost,
    netMerchantPayout: record.netMerchantPayout,
  });

  return record;
}
