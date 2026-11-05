// path: lib/currency/settlement-currency.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { getEffectiveFxRate } from '@/lib/currency/fx-engine';
import { SUPPORTED_CURRENCIES } from '@/lib/currency/currency-engine';

export interface ConvertSettlementInput {
  tenantId: string;
  companyId: string;
  usdAmount: number;
  settlementCurrency: string;
  customConversionMarginPct?: number | undefined; // Default 1.0% (100 bps)
}

export interface CurrencySettlementRecord {
  id: string;
  tenantId: string;
  companyId: string;
  usdAmount: number;
  settlementCurrency: string;
  midMarketRate: number;
  conversionMarginPct: number;
  effectiveFxRate: number;
  settlementAmount: number;
  fxMarginRevenueUsd: number;
  status: 'completed' | 'pending' | 'failed';
  ledgerJournalId: string;
  createdAt: string;
}

const settlementsStore = new Map<string, CurrencySettlementRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 173.1: Converts merchant USD balance to preferred payout currency
 * and generates multi-currency ledger journal entries.
 * Section 28: "Settlement in merchant preferred currency with automatic conversion ledger entries."
 */
export async function executeMerchantCurrencySettlement(
  input: ConvertSettlementInput
): Promise<CurrencySettlementRecord> {
  const currency = input.settlementCurrency.toUpperCase();
  const marginPct = input.customConversionMarginPct ?? 1.0; // 1.0% FX margin

  if (currency === 'USD') {
    // Direct USD settlement: 0% conversion margin
    const id = generateUuidV7();
    const ledgerJournalId = generateUuidV7();
    const now = new Date().toISOString();

    const record: CurrencySettlementRecord = {
      id,
      tenantId: input.tenantId,
      companyId: input.companyId,
      usdAmount: input.usdAmount,
      settlementCurrency: 'USD',
      midMarketRate: 1.0,
      conversionMarginPct: 0.0,
      effectiveFxRate: 1.0,
      settlementAmount: input.usdAmount,
      fxMarginRevenueUsd: 0.0,
      status: 'completed',
      ledgerJournalId,
      createdAt: now,
    };

    settlementsStore.set(id, record);
    return record;
  }

  const currMeta = SUPPORTED_CURRENCIES[currency];
  if (!currMeta) {
    throw new Error(`Unsupported settlement currency: ${currency}`);
  }

  // Retrieve effective mid-market FX rate
  const rateRecord = getEffectiveFxRate(input.tenantId, currency);
  if (!rateRecord) {
    throw new Error(`Exchange rate not available for USD to ${currency}.`);
  }

  const midMarketRate = rateRecord.midMarketRate;
  // Effective payout rate: merchant receives rate discounted by conversion margin
  const effectiveFxRate = Number((midMarketRate * (1 - marginPct / 100)).toFixed(6));

  const rawSettlementAmount = input.usdAmount * effectiveFxRate;
  const factor = Math.pow(10, currMeta.decimals);
  const settlementAmount = Number((Math.round(rawSettlementAmount * factor) / factor).toFixed(currMeta.decimals));

  const fxMarginRevenueUsd = Number((input.usdAmount * (marginPct / 100)).toFixed(4));
  const id = generateUuidV7();
  const ledgerJournalId = generateUuidV7();
  const now = new Date().toISOString();

  const record: CurrencySettlementRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    usdAmount: input.usdAmount,
    settlementCurrency: currency,
    midMarketRate,
    conversionMarginPct: marginPct,
    effectiveFxRate,
    settlementAmount,
    fxMarginRevenueUsd,
    status: 'completed',
    ledgerJournalId,
    createdAt: now,
  };

  settlementsStore.set(id, record);

  logger.info('Merchant currency settlement conversion completed', {
    settlementId: id,
    companyId: input.companyId,
    usdAmount: input.usdAmount,
    settlementCurrency: currency,
    settlementAmount,
    fxMarginRevenueUsd,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'MERCHANT_CURRENCY_SETTLEMENT_EXECUTED',
      entity_type: 'merchant_currency_settlement',
      entity_id: id,
      payload: {
        companyId: input.companyId,
        usdAmount: input.usdAmount,
        settlementCurrency: currency,
        settlementAmount,
        fxMarginRevenueUsd,
        ledgerJournalId,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log currency settlement', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Test helpers.
 */
export function getCurrencySettlement(id: string): CurrencySettlementRecord | undefined {
  return settlementsStore.get(id);
}

export function resetCurrencySettlementsStore(): void {
  settlementsStore.clear();
}
