// path: tests/processors/registry.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PaymentProcessorRegistry,
  PROCESSOR_CAPABILITY_MATRIX,
  processorRegistry,
} from '@/lib/processors/registry';
import type { PaymentProcessorSlug } from '@/types/processors';

describe('Step 112: Payment Processor Registry & Capability Matrix', () => {
  beforeEach(() => {
    PaymentProcessorRegistry.resetInstance();
  });

  describe('Step 112.1: Registry Initialization & Defaults', () => {
    it('registers all 5 launch providers (NMI, Payoneer, Rainforest, Stripe Connect, Airwallex)', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      const allProcessors = registry.listAllProcessors();

      expect(allProcessors).toHaveLength(5);
      const slugs = allProcessors.map((p) => p.slug);
      expect(slugs).toContain('nmi');
      expect(slugs).toContain('payoneer');
      expect(slugs).toContain('rainforest');
      expect(slugs).toContain('stripe_connect');
      expect(slugs).toContain('airwallex');
    });

    it('returns valid adapter instances implementing PaymentProcessorAdapter for each slug', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      const slugs: PaymentProcessorSlug[] = [
        'nmi',
        'payoneer',
        'rainforest',
        'stripe_connect',
        'airwallex',
      ];

      for (const slug of slugs) {
        const adapter = registry.getAdapter(slug);
        expect(adapter).toBeDefined();
        expect(adapter.providerSlug).toBe(slug);
        expect(typeof adapter.authorizePayment).toBe('function');
        expect(typeof adapter.createPayout).toBe('function');
        expect(typeof adapter.testConnection).toBe('function');
      }
    });

    it('caches adapter instance per slug on subsequent calls', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      const adapter1 = registry.getAdapter('stripe_connect');
      const adapter2 = registry.getAdapter('stripe_connect');
      expect(adapter1).toBe(adapter2);
    });

    it('throws when requesting an unsupported processor slug', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      expect(() => {
        // @ts-expect-error Testing invalid runtime slug
        registry.getAdapter('unsupported_gateway');
      }).toThrow(/Unsupported payment processor/i);
    });
  });

  describe('Step 112.2: Capability Matrix Specifications', () => {
    it('accurately specifies NMI capabilities (card acceptance, sub-merchants, no payouts)', () => {
      const nmi = PROCESSOR_CAPABILITY_MATRIX.nmi;
      expect(nmi.capabilities.cardAcceptance).toBe(true);
      expect(nmi.capabilities.subMerchantCreation).toBe(true);
      expect(nmi.capabilities.payouts).toBe(false);
      expect(nmi.capabilities.hostedFields).toBe(true);
      expect(nmi.clientLibraries).toContain('Collect.js');
    });

    it('accurately specifies Payoneer capabilities (specialized mass payouts, no card acquiring)', () => {
      const payoneer = PROCESSOR_CAPABILITY_MATRIX.payoneer;
      expect(payoneer.capabilities.cardAcceptance).toBe(false);
      expect(payoneer.capabilities.payouts).toBe(true);
      expect(payoneer.capabilities.subMerchantCreation).toBe(false);
    });

    it('accurately specifies Rainforest capabilities (embedded payfac, cards, payouts, sub-merchants)', () => {
      const rainforest = PROCESSOR_CAPABILITY_MATRIX.rainforest;
      expect(rainforest.capabilities.cardAcceptance).toBe(true);
      expect(rainforest.capabilities.subMerchantCreation).toBe(true);
      expect(rainforest.capabilities.payouts).toBe(true);
      expect(rainforest.capabilities.hostedFields).toBe(true);
    });

    it('accurately specifies Stripe Connect capabilities (cards, wallets, sub-merchants, payouts)', () => {
      const stripe = PROCESSOR_CAPABILITY_MATRIX.stripe_connect;
      expect(stripe.capabilities.cardAcceptance).toBe(true);
      expect(stripe.capabilities.eWallets).toBe(true);
      expect(stripe.capabilities.subMerchantCreation).toBe(true);
      expect(stripe.capabilities.payouts).toBe(true);
      expect(stripe.capabilities.hostedFields).toBe(true);
    });

    it('accurately specifies Airwallex capabilities (cards, wallets, payouts, global accounts)', () => {
      const airwallex = PROCESSOR_CAPABILITY_MATRIX.airwallex;
      expect(airwallex.capabilities.cardAcceptance).toBe(true);
      expect(airwallex.capabilities.eWallets).toBe(true);
      expect(airwallex.capabilities.payouts).toBe(true);
      expect(airwallex.capabilities.subMerchantCreation).toBe(true);
    });
  });

  describe('Step 112.3: Registry Query Methods & Filters', () => {
    it('queries payout-capable providers and returns Payoneer, Airwallex, Stripe Connect, and Rainforest', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      const payoutProcessors = registry.getAvailableProcessors({
        capability: 'payouts',
      });

      const slugs = payoutProcessors.map((p) => p.slug);
      expect(slugs).toContain('payoneer');
      expect(slugs).toContain('airwallex');
      expect(slugs).toContain('stripe_connect');
      expect(slugs).toContain('rainforest');
      expect(slugs).not.toContain('nmi');
    });

    it('queries card-acceptance providers and excludes Payoneer', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      const cardProcessors = registry.getAvailableProcessors({
        capability: 'cardAcceptance',
      });

      const slugs = cardProcessors.map((p) => p.slug);
      expect(slugs).toContain('nmi');
      expect(slugs).toContain('rainforest');
      expect(slugs).toContain('stripe_connect');
      expect(slugs).toContain('airwallex');
      expect(slugs).not.toContain('payoneer');
    });

    it('filters processors by country support', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      // Test Bangladesh (BD) -> only Payoneer supports local cross-border payout in matrix
      const bdProcessors = registry.getAvailableProcessors({ country: 'BD' });
      expect(bdProcessors.map((p) => p.slug)).toEqual(['payoneer']);

      // Test US -> all 5 support US
      const usProcessors = registry.getAvailableProcessors({ country: 'US' });
      expect(usProcessors).toHaveLength(5);
    });

    it('filters by multiple combined capabilities', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      const fullStack = registry.getAvailableProcessors({
        capabilities: ['cardAcceptance', 'subMerchantCreation', 'payouts'],
      });

      const slugs = fullStack.map((p) => p.slug);
      expect(slugs).toContain('stripe_connect');
      expect(slugs).toContain('rainforest');
      expect(slugs).toContain('airwallex');
      expect(slugs).not.toContain('nmi'); // No payouts
      expect(slugs).not.toContain('payoneer'); // No card acceptance
    });

    it('allows registering a custom adapter factory override', () => {
      const registry = PaymentProcessorRegistry.getInstance();
      let customCreated = false;

      registry.register('stripe_connect', () => {
        customCreated = true;
        const defaultAdapter = processorRegistry.getAdapter('stripe_connect');
        return defaultAdapter;
      });

      const adapter = registry.getAdapter('stripe_connect');
      expect(customCreated).toBe(true);
      expect(adapter).toBeDefined();
    });
  });
});
