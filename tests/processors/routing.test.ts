// path: tests/processors/routing.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolvePaymentProcessor,
  UnroutablePaymentError,
  registerTenantRoutingRules,
  clearTenantRoutingRules,
  DEFAULT_ROUTING_RULES,
  type TransactionRoutingContext,
  type RoutingRule,
} from '@/lib/processors/routing';
import { Money } from '@/lib/money/money';

describe('Deterministic Payment Routing Rules Engine (Step 123)', () => {
  const defaultContext: TransactionRoutingContext = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    companyId: '22222222-2222-4222-8222-222222222222',
    amount: Money.from('150.0000'),
    currency: 'USD',
    merchantCountry: 'US',
    payerCountry: 'US',
    cardBrand: 'visa',
    paymentMethodType: 'card',
  };

  beforeEach(() => {
    clearTenantRoutingRules();
  });

  describe('Currency Invariant & Rejection', () => {
    it('fails closed and rejects transaction with non-USD currency', async () => {
      const nonUsdContext: TransactionRoutingContext = {
        ...defaultContext,
        currency: 'EUR',
      };

      await expect(resolvePaymentProcessor(nonUsdContext)).rejects.toThrow(
        UnroutablePaymentError
      );

      try {
        await resolvePaymentProcessor(nonUsdContext);
      } catch (err) {
        expect(err).toBeInstanceOf(UnroutablePaymentError);
        const error = err as UnroutablePaymentError;
        expect(error.code).toBe('UNROUTABLE_PAYMENT');
        expect(error.httpStatus).toBe(422);
        expect(error.message).toContain("Unsupported transaction currency 'EUR'");
      }
    });
  });

  describe('Fail-Closed Guard for Unroutable Criteria', () => {
    it('rejects transaction when no routing rule matches rather than silently falling back', async () => {
      // Country ZW with custom empty rules
      const unroutedContext: TransactionRoutingContext = {
        ...defaultContext,
        merchantCountry: 'ZW',
        payerCountry: 'ZW',
      };

      const restrictedRules: RoutingRule[] = [
        {
          id: 'rule_only_singapore',
          ruleName: 'Only SG Allowed',
          priority: 10,
          targetProvider: 'airwallex',
          conditions: {
            merchantCountries: ['SG'],
            currencies: ['USD'],
          },
          isActive: true,
        },
      ];

      await expect(
        resolvePaymentProcessor(unroutedContext, restrictedRules)
      ).rejects.toThrow(UnroutablePaymentError);

      try {
        await resolvePaymentProcessor(unroutedContext, restrictedRules);
      } catch (err) {
        const error = err as UnroutablePaymentError;
        expect(error.code).toBe('UNROUTABLE_PAYMENT');
        expect(error.message).toContain('No payment routing rule matched');
        expect(error.context.merchantCountry).toBe('ZW');
      }
    });

    it('skips inactive rules even if conditions would otherwise match', async () => {
      const customRules: RoutingRule[] = [
        {
          id: 'rule_inactive_us',
          ruleName: 'Inactive US Rule',
          priority: 5,
          targetProvider: 'stripe_connect',
          conditions: {
            merchantCountries: ['US'],
            currencies: ['USD'],
          },
          isActive: false, // Disabled
        },
      ];

      await expect(
        resolvePaymentProcessor(defaultContext, customRules)
      ).rejects.toThrow(UnroutablePaymentError);
    });
  });

  describe('Default System Rules Routing Evaluation', () => {
    it('routes payout transactions to Payoneer (priority 10)', async () => {
      const payoutContext: TransactionRoutingContext = {
        ...defaultContext,
        paymentMethodType: 'payout',
      };

      const decision = await resolvePaymentProcessor(payoutContext);
      expect(decision.targetProvider).toBe('payoneer');
      expect(decision.matchedRuleId).toBe('rule_payouts_global');
      expect(decision.priority).toBe(10);
    });

    it('routes APAC / Asian payer transactions to Airwallex (priority 20)', async () => {
      const apacContext: TransactionRoutingContext = {
        ...defaultContext,
        merchantCountry: 'US',
        payerCountry: 'SG', // Singapore
        paymentMethodType: 'card',
      };

      const decision = await resolvePaymentProcessor(apacContext);
      expect(decision.targetProvider).toBe('airwallex');
      expect(decision.matchedRuleId).toBe('rule_asian_cross_border');
      expect(decision.priority).toBe(20);
    });

    it('routes SaaS MCC vertical merchants in North America to Rainforest (priority 30)', async () => {
      const saasContext: TransactionRoutingContext = {
        ...defaultContext,
        merchantCountry: 'US',
        payerCountry: 'US',
        mccCode: '5734', // Computer Software Stores
        paymentMethodType: 'card',
      };

      const decision = await resolvePaymentProcessor(saasContext);
      expect(decision.targetProvider).toBe('rainforest');
      expect(decision.matchedRuleId).toBe('rule_rainforest_saas');
      expect(decision.priority).toBe(30);
    });

    it('routes standard US/EU card checkout to Stripe Connect (priority 40)', async () => {
      const standardCardContext: TransactionRoutingContext = {
        ...defaultContext,
        merchantCountry: 'US',
        payerCountry: 'US',
        mccCode: '5411', // Grocery Stores (not SaaS)
        paymentMethodType: 'card',
      };

      const decision = await resolvePaymentProcessor(standardCardContext);
      expect(decision.targetProvider).toBe('stripe_connect');
      expect(decision.matchedRuleId).toBe('rule_stripe_global_cards');
      expect(decision.priority).toBe(40);
    });

    it('routes enterprise merchant cards when earlier rules do not match', async () => {
      // Payer country outside Stripe rule's typical list, but within NMI
      const nmiRules: RoutingRule[] = [
        {
          id: 'rule_nmi_direct',
          ruleName: 'NMI High Volume Enterprise',
          priority: 15,
          targetProvider: 'nmi',
          conditions: {
            merchantCountries: ['US'],
            cardBrands: ['amex'],
            currencies: ['USD'],
          },
          isActive: true,
        },
      ];

      const nmiContext: TransactionRoutingContext = {
        ...defaultContext,
        cardBrand: 'amex',
      };

      const decision = await resolvePaymentProcessor(nmiContext, nmiRules);
      expect(decision.targetProvider).toBe('nmi');
      expect(decision.matchedRuleId).toBe('rule_nmi_direct');
    });
  });

  describe('Deterministic Priority Ordering & Overrides', () => {
    it('always selects the highest priority rule (lowest priority number) when multiple match', async () => {
      const competingRules: RoutingRule[] = [
        {
          id: 'rule_low_priority_stripe',
          ruleName: 'Low Priority Stripe',
          priority: 100,
          targetProvider: 'stripe_connect',
          conditions: { merchantCountries: ['US'] },
          isActive: true,
        },
        {
          id: 'rule_high_priority_nmi',
          ruleName: 'High Priority NMI',
          priority: 5,
          targetProvider: 'nmi',
          conditions: { merchantCountries: ['US'] },
          isActive: true,
        },
      ];

      const decision = await resolvePaymentProcessor(defaultContext, competingRules);
      expect(decision.targetProvider).toBe('nmi');
      expect(decision.matchedRuleId).toBe('rule_high_priority_nmi');
      expect(decision.priority).toBe(5);
    });

    it('honors direct explicit requestedProvider override with priority 0', async () => {
      const overrideContext: TransactionRoutingContext = {
        ...defaultContext,
        requestedProvider: 'airwallex',
      };

      const decision = await resolvePaymentProcessor(overrideContext);
      expect(decision.targetProvider).toBe('airwallex');
      expect(decision.matchedRuleId).toBe('explicit_override');
      expect(decision.priority).toBe(0);
    });

    it('evaluates amount thresholds properly', async () => {
      const tieredRules: RoutingRule[] = [
        {
          id: 'rule_micro_transactions',
          ruleName: 'Micro Transactions under 10 USD -> Stripe',
          priority: 10,
          targetProvider: 'stripe_connect',
          conditions: {
            maxAmountUsd: '10.0000',
            merchantCountries: ['US'],
          },
          isActive: true,
        },
        {
          id: 'rule_large_transactions',
          ruleName: 'High Ticket over 100 USD -> NMI',
          priority: 20,
          targetProvider: 'nmi',
          conditions: {
            minAmountUsd: '100.0000',
            merchantCountries: ['US'],
          },
          isActive: true,
        },
      ];

      // Small amount: $5.00
      const smallTx = { ...defaultContext, amount: Money.from('5.0000') };
      const smallDecision = await resolvePaymentProcessor(smallTx, tieredRules);
      expect(smallDecision.targetProvider).toBe('stripe_connect');

      // Large amount: $500.00
      const largeTx = { ...defaultContext, amount: Money.from('500.0000') };
      const largeDecision = await resolvePaymentProcessor(largeTx, tieredRules);
      expect(largeDecision.targetProvider).toBe('nmi');
    });

    it('supports tenant-specific routing rule registration', async () => {
      const tenantId = '99999999-9999-4999-8999-999999999999';
      const tenantRules: RoutingRule[] = [
        {
          id: 'rule_tenant_rainforest',
          ruleName: 'Tenant Dedicated Rainforest',
          priority: 1,
          targetProvider: 'rainforest',
          conditions: { merchantCountries: ['US'] },
          isActive: true,
        },
      ];

      registerTenantRoutingRules(tenantId, tenantRules);

      const tenantTx: TransactionRoutingContext = {
        ...defaultContext,
        tenantId,
      };

      const decision = await resolvePaymentProcessor(tenantTx);
      expect(decision.targetProvider).toBe('rainforest');
      expect(decision.matchedRuleId).toBe('rule_tenant_rainforest');
    });
  });
});
