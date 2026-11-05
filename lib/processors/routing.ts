// path: lib/processors/routing.ts

import { Money } from '@/lib/money/money';
import type { PaymentProcessorSlug } from '@/types/processors';
import { logger } from '@/lib/logger/logger';

export type CardBrand =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'unionpay'
  | 'jcb'
  | 'unknown';

export class UnroutablePaymentError extends Error {
  readonly code = 'UNROUTABLE_PAYMENT';
  readonly httpStatus = 422;
  readonly context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(`[Routing Engine: Fail-Closed] ${message}`);
    this.name = 'UnroutablePaymentError';
    this.context = context;
  }
}

export interface TransactionRoutingContext {
  tenantId: string;
  companyId: string;
  amount: Money;
  currency: 'USD' | string;
  merchantCountry: string; // ISO 3166-1 alpha-2
  payerCountry?: string | undefined;
  cardBrand?: CardBrand | undefined;
  mccCode?: string | undefined;
  paymentMethodType?: 'card' | 'wallet' | 'bank_transfer' | 'payout' | undefined;
  requestedProvider?: PaymentProcessorSlug | undefined;
}

export interface RoutingRuleConditions {
  merchantCountries?: string[] | undefined;
  payerCountries?: string[] | undefined;
  cardBrands?: CardBrand[] | undefined;
  mccCodes?: string[] | undefined;
  paymentMethodTypes?: ('card' | 'wallet' | 'bank_transfer' | 'payout')[] | undefined;
  minAmountUsd?: string | undefined;
  maxAmountUsd?: string | undefined;
  currencies?: string[] | undefined;
}

export interface RoutingRule {
  id: string;
  ruleName: string;
  priority: number; // Monotonic ascending: lower number = higher priority
  targetProvider: PaymentProcessorSlug;
  conditions: RoutingRuleConditions;
  isActive: boolean;
}

export interface RoutingDecision {
  targetProvider: PaymentProcessorSlug;
  matchedRuleId: string;
  matchedRuleName: string;
  priority: number;
  reason: string;
  evaluatedAt: string;
}

/**
 * Built-in deterministic routing rules fulfilling KD Solution IT multi-gateway strategy:
 * 1. Payout transactions -> Payoneer / Airwallex
 * 2. Asian / Cross-border acquiring -> Airwallex
 * 3. US/CA standard card / digital wallet checkout -> Stripe Connect / Rainforest / NMI
 */
export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  // 1. High priority: Mass and local payout routing
  {
    id: 'rule_payouts_global',
    ruleName: 'Global Mass Payouts -> Payoneer',
    priority: 10,
    targetProvider: 'payoneer',
    conditions: {
      paymentMethodTypes: ['payout'],
      currencies: ['USD'],
    },
    isActive: true,
  },
  // 2. Asian / Cross-Border regional transactions -> Airwallex
  {
    id: 'rule_asian_cross_border',
    ruleName: 'Asian & Cross-Border APAC acquiring -> Airwallex',
    priority: 20,
    targetProvider: 'airwallex',
    conditions: {
      payerCountries: ['SG', 'HK', 'AU', 'NZ', 'JP', 'MY', 'TH', 'ID', 'PH', 'VN', 'CN'],
      paymentMethodTypes: ['card', 'wallet'],
      currencies: ['USD'],
    },
    isActive: true,
  },
  // 3. SaaS / Vertical PayFac embedded accounts -> Rainforest
  {
    id: 'rule_rainforest_saas',
    ruleName: 'North America Embedded Platform Processing -> Rainforest',
    priority: 30,
    targetProvider: 'rainforest',
    conditions: {
      merchantCountries: ['US', 'CA'],
      payerCountries: ['US', 'CA'],
      mccCodes: ['5732', '5734', '7372', '7379'], // Computer software / SaaS
      paymentMethodTypes: ['card', 'wallet'],
      currencies: ['USD'],
    },
    isActive: true,
  },
  // 4. North American & European standard card processing -> Stripe Connect
  {
    id: 'rule_stripe_global_cards',
    ruleName: 'North America & Europe Digital Wallets & Cards -> Stripe Connect',
    priority: 40,
    targetProvider: 'stripe_connect',
    conditions: {
      merchantCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'IE'],
      paymentMethodTypes: ['card', 'wallet'],
      currencies: ['USD'],
    },
    isActive: true,
  },
  // 5. Enterprise High-Volume / Multi-MID Gateway -> NMI
  {
    id: 'rule_nmi_enterprise',
    ruleName: 'Enterprise Card Acceptance -> NMI (Network Merchants)',
    priority: 50,
    targetProvider: 'nmi',
    conditions: {
      merchantCountries: ['US', 'CA', 'GB'],
      paymentMethodTypes: ['card'],
      currencies: ['USD'],
    },
    isActive: true,
  },
];

// In-memory tenant routing rule registry
const tenantRulesRegistry = new Map<string, RoutingRule[]>();

/**
 * Registers custom routing rules for a tenant or testing suite.
 */
export function registerTenantRoutingRules(tenantId: string, rules: RoutingRule[]): void {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  tenantRulesRegistry.set(tenantId, sorted);
}

/**
 * Resets custom routing rules for test isolation.
 */
export function clearTenantRoutingRules(tenantId?: string): void {
  if (tenantId) {
    tenantRulesRegistry.delete(tenantId);
  } else {
    tenantRulesRegistry.clear();
  }
}

/**
 * Evaluates whether a transaction context satisfies all criteria of a routing rule.
 */
function matchesRuleConditions(
  ctx: TransactionRoutingContext,
  conditions: RoutingRuleConditions
): boolean {
  // 1. Currency check (Strictly USD platform requirement)
  if (conditions.currencies && conditions.currencies.length > 0) {
    if (!conditions.currencies.includes(ctx.currency.toUpperCase())) {
      return false;
    }
  }

  // 2. Payment method type check
  if (conditions.paymentMethodTypes && conditions.paymentMethodTypes.length > 0) {
    const methodType = ctx.paymentMethodType ?? 'card';
    if (!conditions.paymentMethodTypes.includes(methodType)) {
      return false;
    }
  }

  // 3. Merchant country check
  if (conditions.merchantCountries && conditions.merchantCountries.length > 0) {
    const upperMerchant = ctx.merchantCountry.toUpperCase();
    if (!conditions.merchantCountries.some((c) => c.toUpperCase() === upperMerchant)) {
      return false;
    }
  }

  // 4. Payer country check
  if (conditions.payerCountries && conditions.payerCountries.length > 0 && ctx.payerCountry) {
    const upperPayer = ctx.payerCountry.toUpperCase();
    if (!conditions.payerCountries.some((c) => c.toUpperCase() === upperPayer)) {
      return false;
    }
  }

  // 5. Card brand check
  if (conditions.cardBrands && conditions.cardBrands.length > 0 && ctx.cardBrand) {
    if (!conditions.cardBrands.includes(ctx.cardBrand)) {
      return false;
    }
  }

  // 6. MCC code check
  if (conditions.mccCodes && conditions.mccCodes.length > 0 && ctx.mccCode) {
    if (!conditions.mccCodes.includes(ctx.mccCode)) {
      return false;
    }
  }

  // 7. Amount boundaries
  if (conditions.minAmountUsd) {
    const minMoney = Money.from(conditions.minAmountUsd);
    if (ctx.amount.lessThan(minMoney)) {
      return false;
    }
  }

  if (conditions.maxAmountUsd) {
    const maxMoney = Money.from(conditions.maxAmountUsd);
    if (ctx.amount.greaterThan(maxMoney)) {
      return false;
    }
  }

  return true;
}

/**
 * Deterministic Payment Processor Resolver with Fail-Closed Guard.
 * Evaluates prioritized rules deterministically.
 * If no rule matches, rejects payment with UnroutablePaymentError; NEVER silently reroutes.
 */
export async function resolvePaymentProcessor(
  ctx: TransactionRoutingContext,
  customRulesOverride?: RoutingRule[]
): Promise<RoutingDecision> {
  // 1. Mandatory Invariant: Currency must be USD
  if (ctx.currency.toUpperCase() !== 'USD') {
    throw new UnroutablePaymentError(
      `Unsupported transaction currency '${ctx.currency}'. Platform strictly operates and settles in USD numeric(18,4).`,
      { currency: ctx.currency, companyId: ctx.companyId }
    );
  }

  // 2. Direct explicit processor request (if specified and valid)
  if (ctx.requestedProvider) {
    return {
      targetProvider: ctx.requestedProvider,
      matchedRuleId: 'explicit_override',
      matchedRuleName: 'Direct Explicit Processor Request',
      priority: 0,
      reason: `Direct requested processor: ${ctx.requestedProvider}`,
      evaluatedAt: new Date().toISOString(),
    };
  }

  // 3. Resolve active rule set: custom override -> tenant rules -> default system rules
  const candidateRules =
    customRulesOverride ??
    tenantRulesRegistry.get(ctx.tenantId) ??
    DEFAULT_ROUTING_RULES;

  const sortedRules = [...candidateRules]
    .filter((r) => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  // 4. Deterministic evaluation in priority order
  for (const rule of sortedRules) {
    if (matchesRuleConditions(ctx, rule.conditions)) {
      logger.info('Payment routed to processor', {
        companyId: '[REDACTED]',
        provider: rule.targetProvider,
        ruleId: rule.id,
        priority: rule.priority,
      });

      return {
        targetProvider: rule.targetProvider,
        matchedRuleId: rule.id,
        matchedRuleName: rule.ruleName,
        priority: rule.priority,
        reason: `Matched routing rule '${rule.ruleName}' (priority ${rule.priority})`,
        evaluatedAt: new Date().toISOString(),
      };
    }
  }

  // 5. FAIL-CLOSED GUARD: No matching routing rule exists
  logger.warn('Payment routing failed closed: no matching rule found for transaction', {
    companyId: '[REDACTED]',
    merchantCountry: ctx.merchantCountry,
    payerCountry: ctx.payerCountry,
    paymentMethodType: ctx.paymentMethodType,
    cardBrand: ctx.cardBrand,
  });

  throw new UnroutablePaymentError(
    `No payment routing rule matched for transaction (merchantCountry: ${ctx.merchantCountry}, payerCountry: ${ctx.payerCountry ?? 'N/A'}, cardBrand: ${ctx.cardBrand ?? 'N/A'}). Transaction rejected per fail-closed security policy.`,
    {
      companyId: ctx.companyId,
      merchantCountry: ctx.merchantCountry,
      payerCountry: ctx.payerCountry,
      currency: ctx.currency,
      paymentMethodType: ctx.paymentMethodType,
    }
  );
}
