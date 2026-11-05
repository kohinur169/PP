// path: lib/processors/routing-waterfall.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type PaymentProcessorId =
  | 'nmi'
  | 'stripe_connect'
  | 'rainforest'
  | 'airwallex'
  | 'payoneer';

export interface RoutingEvaluationInput {
  tenantId: string;
  companyId: string;
  cardBrand: 'visa' | 'mastercard' | 'amex' | 'discover';
  currency: string;
  amountUsd: number;
  issuingCountry: string; // ISO-2 (e.g., 'US', 'GB', 'DE')
  merchantMcc?: string | undefined;
}

export interface ProcessorCostEstimate {
  processor: PaymentProcessorId;
  variableFeeBps: number;
  fixedFeeUsd: number;
  estimatedFeeUsd: number;
  isEligible: boolean;
  ineligibilityReason?: string | undefined;
}

export interface RoutingEvaluationResult {
  simulationId: string;
  selectedProcessor: PaymentProcessorId;
  waterfallOrder: PaymentProcessorId[];
  matchedRuleName: string;
  estimatedCostUsd: number;
  costEstimates: ProcessorCostEstimate[];
  reasoning: string;
}

const auditRepo = new AuditLogRepository();

/**
 * Calculates processor fee estimates for least-cost routing.
 */
export function estimateProcessorCosts(
  amountUsd: number,
  isDomestic: boolean,
  cardBrand: string,
  currency: string
): ProcessorCostEstimate[] {
  const estimates: ProcessorCostEstimate[] = [];

  // 1. NMI: 220 bps + $0.20 domestic, 280 bps + $0.20 intl. Optimal for Amex & high ticket.
  const nmiBps = isDomestic ? 220 : 280;
  const nmiFixed = 0.2;
  estimates.push({
    processor: 'nmi',
    variableFeeBps: nmiBps,
    fixedFeeUsd: nmiFixed,
    estimatedFeeUsd: Number(((amountUsd * nmiBps) / 10000 + nmiFixed).toFixed(4)),
    isEligible: true,
  });

  // 2. Rainforest: 240 bps + $0.15 domestic. Only supports USD / US domestic merchants.
  const rfEligible = currency.toUpperCase() === 'USD' && isDomestic;
  const rfBps = 240;
  const rfFixed = 0.15;
  estimates.push({
    processor: 'rainforest',
    variableFeeBps: rfBps,
    fixedFeeUsd: rfFixed,
    estimatedFeeUsd: Number(((amountUsd * rfBps) / 10000 + rfFixed).toFixed(4)),
    isEligible: rfEligible,
    ineligibilityReason: rfEligible ? undefined : 'Rainforest requires USD domestic transaction.',
  });

  // 3. Stripe Connect: 290 bps + $0.30 domestic, 340 bps + $0.30 intl.
  const stripeBps = isDomestic ? 290 : 340;
  const stripeFixed = 0.3;
  estimates.push({
    processor: 'stripe_connect',
    variableFeeBps: stripeBps,
    fixedFeeUsd: stripeFixed,
    estimatedFeeUsd: Number(((amountUsd * stripeBps) / 10000 + stripeFixed).toFixed(4)),
    isEligible: true,
  });

  // 4. Airwallex: 210 bps + $0.20. Specialized for international multi-currency.
  const awxEligible = true;
  const awxBps = isDomestic ? 230 : 210;
  const awxFixed = 0.2;
  estimates.push({
    processor: 'airwallex',
    variableFeeBps: awxBps,
    fixedFeeUsd: awxFixed,
    estimatedFeeUsd: Number(((amountUsd * awxBps) / 10000 + awxFixed).toFixed(4)),
    isEligible: awxEligible,
  });

  // 5. Payoneer: 250 bps + $0.25. Marketplace cross-border payouts.
  estimates.push({
    processor: 'payoneer',
    variableFeeBps: 250,
    fixedFeeUsd: 0.25,
    estimatedFeeUsd: Number(((amountUsd * 250) / 10000 + 0.25).toFixed(4)),
    isEligible: cardBrand !== 'discover', // Payoneer does not accept Discover cards
    ineligibilityReason: cardBrand === 'discover' ? 'Payoneer does not support Discover brand.' : undefined,
  });

  return estimates;
}

/**
 * Step 178.1: Evaluates multi-criteria routing rules and processor priority waterfall.
 * Section 30: "Processor priority waterfall with configurable criteria: card brand, currency, transaction amount, issuing country, merchant category."
 */
export async function evaluateProcessorRouting(
  input: RoutingEvaluationInput
): Promise<RoutingEvaluationResult> {
  const simulationId = generateUuidV7();
  const isDomestic = input.issuingCountry.toUpperCase() === 'US';
  const currencyUpper = input.currency.toUpperCase();
  const isCrossBorder = !isDomestic || currencyUpper !== 'USD';

  const costEstimates = estimateProcessorCosts(
    input.amountUsd,
    isDomestic,
    input.cardBrand,
    currencyUpper
  );

  let selectedProcessor: PaymentProcessorId = 'nmi';
  let matchedRuleName = 'Default Least-Cost Fallback';
  let reasoning = '';
  let waterfallOrder: PaymentProcessorId[] = [];

  // Rule 1: Amex Specialty Routing -> Route directly to NMI Collect.js direct processing
  if (input.cardBrand === 'amex') {
    selectedProcessor = 'nmi';
    matchedRuleName = 'Rule #1: Amex Direct Surcharge Optimization';
    reasoning = 'American Express transactions route directly to NMI for optimal Direct Card acceptance.';
    waterfallOrder = ['nmi', 'stripe_connect', 'airwallex'];
  }
  // Rule 2: Multi-Currency & Cross-Border Non-USD -> Route to Airwallex for native cross-border clearing
  else if (currencyUpper !== 'USD' || (isCrossBorder && ['GB', 'DE', 'FR', 'AU', 'SG'].includes(input.issuingCountry.toUpperCase()))) {
    selectedProcessor = 'airwallex';
    matchedRuleName = 'Rule #2: Cross-Border Multi-Currency Optimization';
    reasoning = `Non-USD or overseas issuing country (${input.issuingCountry}) routes to Airwallex for localized FX clearing.`;
    waterfallOrder = ['airwallex', 'stripe_connect', 'nmi'];
  }
  // Rule 3: Micro-Transactions (< $10 USD) Domestic -> Route to Rainforest for lower fixed fee ($0.15 vs $0.30)
  else if (input.amountUsd < 10.0 && isDomestic) {
    selectedProcessor = 'rainforest';
    matchedRuleName = 'Rule #3: Domestic Micro-Transaction Fixed-Fee Minimization';
    reasoning = 'Micro-ticket (< $10.00) domestic transaction routed to Rainforest for low fixed fee ($0.15).';
    waterfallOrder = ['rainforest', 'nmi', 'stripe_connect'];
  }
  // Rule 4: High Ticket (>= $500 USD) Domestic -> Route to NMI (lower variable bps: 220 bps vs 290 bps)
  else if (input.amountUsd >= 500.0 && isDomestic) {
    selectedProcessor = 'nmi';
    matchedRuleName = 'Rule #4: High-Ticket Domestic Basis Points Optimization';
    reasoning = 'High ticket (>= $500.00) domestic transaction routed to NMI for lowest variable basis points (2.20%).';
    waterfallOrder = ['nmi', 'stripe_connect', 'rainforest'];
  }
  // Rule 5: Standard Least-Cost Fallback
  else {
    const eligible = costEstimates.filter((c) => c.isEligible).sort((a, b) => a.estimatedFeeUsd - b.estimatedFeeUsd);
    selectedProcessor = eligible[0]?.processor ?? 'stripe_connect';
    matchedRuleName = 'Rule #5: Least-Cost Automated Evaluation';
    reasoning = `Standard ticket routed to ${selectedProcessor} with lowest fee of $${eligible[0]?.estimatedFeeUsd}.`;
    waterfallOrder = eligible.map((e) => e.processor);
  }

  const selectedCost = costEstimates.find((c) => c.processor === selectedProcessor)?.estimatedFeeUsd ?? 0.0;

  const result: RoutingEvaluationResult = {
    simulationId,
    selectedProcessor,
    waterfallOrder,
    matchedRuleName,
    estimatedCostUsd: selectedCost,
    costEstimates,
    reasoning,
  };

  logger.info('Processor routing waterfall evaluated', {
    simulationId,
    cardBrand: input.cardBrand,
    amountUsd: input.amountUsd,
    selectedProcessor,
    matchedRuleName,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'PROCESSOR_ROUTING_EVALUATED',
      entity_type: 'processor_routing_simulation',
      entity_id: simulationId,
      payload: {
        companyId: input.companyId,
        cardBrand: input.cardBrand,
        amountUsd: input.amountUsd,
        selectedProcessor,
        waterfallOrder,
        matchedRuleName,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log processor routing', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}
