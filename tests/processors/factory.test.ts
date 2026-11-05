// path: tests/processors/factory.test.ts

import { describe, it, expect } from 'vitest';
import { PaymentProcessorFactory, processorFactory } from '@/lib/processors/factory';
import { PaymentProcessorRegistry } from '@/lib/processors/registry';
import { Money } from '@/lib/money/money';
import { MockPaymentProcessorAdapter } from '@/lib/processors/mock';
import type {
  PaymentProcessorAdapter,
  AuthorizeRequest,
  ChargeResult,
  CaptureRequest,
  RefundRequest,
  RefundResult,
  PayoutRequest,
  PayoutResult,
} from '@/lib/processors/types';

describe('Step 119: Gateway Architecture Extension Point for Future Providers', () => {
  describe('Step 119.1: Dynamic Adapter Resolution & Factory Instances', () => {
    it('returns factory singleton and resolves standard launch providers', () => {
      const factory = PaymentProcessorFactory.getInstance();
      expect(factory).toBeDefined();

      const nmi = factory.getAdapter('nmi');
      expect(nmi.providerSlug).toBe('nmi');

      const stripe = factory.getAdapter('stripe_connect');
      expect(stripe.providerSlug).toBe('stripe_connect');

      const payoneer = factory.getAdapter('payoneer');
      expect(payoneer.providerSlug).toBe('payoneer');

      const rainforest = factory.getAdapter('rainforest');
      expect(rainforest.providerSlug).toBe('rainforest');

      const airwallex = factory.getAdapter('airwallex');
      expect(airwallex.providerSlug).toBe('airwallex');
    });

    it('falls back to sandbox mock adapter when forceMock is specified', () => {
      const factory = PaymentProcessorFactory.getInstance();
      const adapter = factory.getAdapter('stripe_connect', { forceMock: true });
      expect(adapter).toBeInstanceOf(MockPaymentProcessorAdapter);
      expect(adapter.providerSlug).toBe('stripe_connect');
    });

    it('lists all available registered processors with metadata', () => {
      const factory = PaymentProcessorFactory.getInstance();
      const list = factory.listAvailableProcessors();
      expect(list.length).toBeGreaterThanOrEqual(5);

      const slugs = list.map((p) => p.slug);
      expect(slugs).toContain('nmi');
      expect(slugs).toContain('stripe_connect');
      expect(slugs).toContain('rainforest');
      expect(slugs).toContain('airwallex');
      expect(slugs).toContain('payoneer');
    });
  });

  describe('Step 119.2: Open-Closed Extensibility (Adding a 6th Provider)', () => {
    class DummySixthCryptoAdapter implements PaymentProcessorAdapter {
      readonly providerSlug = 'crypto_usdc_gateway';
      readonly providerDisplayName = 'USDC Stablecoin Rail';

      async testConnection() {
        return {
          isConnected: true,
          latencyMs: 5,
          environment: 'sandbox' as const,
          apiVersion: 'v1 RPC',
          message: 'Connected to Solana USDC node',
        };
      }

      async createSubMerchant() {
        return {
          success: true,
          providerSubmerchantId: 'usdc_wallet_0x8812',
          status: 'active' as const,
          capabilities: { card_payments: false, transfers: true, payouts: true },
        };
      }

      async authorizePayment(request: AuthorizeRequest): Promise<ChargeResult> {
        return {
          success: true,
          transactionId: `tx_usdc_sig_99182`,
          status: 'authorized',
          amount: request.amount,
          currency: 'USD',
          authorizationCode: 'ONCHAIN_FINALIZED',
        };
      }

      async capturePayment(_request: CaptureRequest): Promise<ChargeResult> {
        throw new Error('Not implemented');
      }

      async refundPayment(_request: RefundRequest): Promise<RefundResult> {
        throw new Error('Not implemented');
      }

      async createPayout(_request: PayoutRequest): Promise<PayoutResult> {
        throw new Error('Not implemented');
      }

      async verifyWebhook() {
        return { isValid: true };
      }
    }

    it('dynamically registers and resolves a new 6th provider without touching core engine', async () => {
      const customRegistry = PaymentProcessorRegistry.getInstance();
      const factory = new PaymentProcessorFactory(customRegistry);

      // Register the 6th provider into registry
      customRegistry.register(
        // @ts-expect-error Custom dynamic slug extension
        'crypto_usdc_gateway',
        () => new DummySixthCryptoAdapter(),
        {
          displayName: 'USDC Stablecoin Rail',
          description: 'Instant settlement via USDC stablecoin network',
          websiteUrl: 'https://usdc.example.com',
          documentationUrl: 'https://docs.usdc.example.com',
          capabilities: {
            cardAcceptance: false,
            eWallets: false,
            subMerchantCreation: true,
            payouts: true,
            hostedFields: false,
            recurringBilling: false,
            level2Level3Data: false,
            threeDSecure: false,
          },
          supportedCountries: ['US', 'CA', 'GB', 'SG', 'HK', 'AE'],
          supportedCurrencies: ['USD'],
          clientLibraries: ['Solana Web3 SDK'],
          isEnabled: true,
          defaultPriority: 60,
        }
      );

      // Retrieve via factory
      const adapter = factory.getAdapter('crypto_usdc_gateway');
      expect(adapter).toBeDefined();
      expect(adapter.providerSlug).toBe('crypto_usdc_gateway');
      expect(adapter.providerDisplayName).toBe('USDC Stablecoin Rail');

      // Test connection
      const connection = await adapter.testConnection();
      expect(connection.isConnected).toBe(true);
      expect(connection.message).toContain('Solana USDC node');

      // Execute charge through generic factory runner
      const result = await factory.executeOperation('crypto_usdc_gateway', async (ad) => {
        return ad.authorizePayment({
          companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
          amount: Money.from(100.0),
          currency: 'USD',
          paymentMethodToken: 'usdc_tx_token_01',
          idempotencyKey: 'idem_usdc_01',
        });
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('tx_usdc_sig_99182');
      expect(result.authorizationCode).toBe('ONCHAIN_FINALIZED');
    });
  });

  describe('Step 119.3: Unified Interface Execution & Graceful Fallback', () => {
    it('executes generic operation without provider-specific if/else branching', async () => {
      const result = await processorFactory.executeOperation(
        'stripe_connect',
        async (adapter) => {
          return adapter.createSubMerchant({
            companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
            legalBusinessName: 'Sandbox Shop',
            taxId: '12-3456789',
            mccCode: '5732',
            representativeEmail: 'sub@sandbox.io',
            countryCode: 'US',
          });
        },
        { forceMock: true }
      );

      expect(result.success).toBe(true);
      expect(result.providerSubmerchantId).toContain('mock_sub_');
    });

    it('falls back to mock sandbox adapter when an unregistered provider slug is queried', () => {
      const adapter = processorFactory.getAdapter('completely_unknown_gateway');
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(MockPaymentProcessorAdapter);
      expect(adapter.providerDisplayName).toContain('COMPLETELY_UNKNOWN_GATEWAY');
    });
  });
});
