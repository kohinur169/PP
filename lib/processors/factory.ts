// path: lib/processors/factory.ts

import type { PaymentProcessorAdapter } from '@/lib/processors/types';
import { processorRegistry, PaymentProcessorRegistry } from '@/lib/processors/registry';
import { NmiAdapter } from '@/lib/processors/nmi';
import { PayoneerAdapter } from '@/lib/processors/payoneer';
import { RainforestAdapter } from '@/lib/processors/rainforest';
import { StripeAdapter } from '@/lib/processors/stripe';
import { AirwallexAdapter } from '@/lib/processors/airwallex';
import { MockPaymentProcessorAdapter } from '@/lib/processors/mock';
import type { PaymentProcessorSlug, ProcessorMetadata } from '@/types/processors';
import { logger } from '@/lib/logger/logger';

export interface ProcessorFactoryOptions {
  /** Optional custom credentials overrides (e.g. sub-merchant or environment keys) */
  credentials?: Record<string, string> | undefined;
  /** Optional tenant identifier for multi-tenant context */
  tenantId?: string | undefined;
  /** Prefer mock sandbox adapter regardless of environment */
  forceMock?: boolean | undefined;
}

/**
 * Open-Closed Payment Processor Factory.
 * Dynamically resolves and instantiates adapters fulfilling PaymentProcessorAdapter.
 * New providers plugged into PaymentProcessorRegistry are automatically resolved
 * without touching core payment execution paths.
 */
export class PaymentProcessorFactory {
  private static instance: PaymentProcessorFactory | null = null;
  private readonly registry: PaymentProcessorRegistry;

  constructor(registry: PaymentProcessorRegistry = processorRegistry) {
    this.registry = registry;
  }

  public static getInstance(): PaymentProcessorFactory {
    if (!PaymentProcessorFactory.instance) {
      PaymentProcessorFactory.instance = new PaymentProcessorFactory();
    }
    return PaymentProcessorFactory.instance;
  }

  /**
   * Resolves and builds a concrete PaymentProcessorAdapter instance for a given provider slug.
   * If custom credentials are supplied, creates a tailored instance; otherwise resolves standard adapter.
   */
  public getAdapter(
    providerSlug: PaymentProcessorSlug | string,
    options?: ProcessorFactoryOptions
  ): PaymentProcessorAdapter {
    if (options?.forceMock) {
      return new MockPaymentProcessorAdapter({
        providerSlug,
        providerDisplayName: `Mock ${providerSlug.toUpperCase()}`,
      });
    }

    const creds = options?.credentials ?? {};

    // Standard official launch adapters
    switch (providerSlug) {
      case 'nmi': {
        const securityKey =
          creds['securityKey'] ??
          creds['security_key'] ??
          process.env['NMI_SECURITY_KEY'] ??
          'mock_nmi_sec_key_default';
        return new NmiAdapter({ securityKey });
      }

      case 'payoneer': {
        const programId = creds['programId'] ?? process.env['PAYONEER_PROGRAM_ID'] ?? 'mock_prog_01';
        const clientId = creds['clientId'] ?? process.env['PAYONEER_CLIENT_ID'] ?? 'mock_client_01';
        const clientSecret =
          creds['clientSecret'] ?? process.env['PAYONEER_CLIENT_SECRET'] ?? 'mock_sec_01';
        return new PayoneerAdapter({ programId, clientId, clientSecret });
      }

      case 'rainforest': {
        const apiKey = creds['apiKey'] ?? process.env['RAINFOREST_API_KEY'] ?? 'mock_rf_key_01';
        return new RainforestAdapter({ apiKey });
      }

      case 'stripe_connect': {
        const apiKey = creds['apiKey'] ?? process.env['STRIPE_SECRET_KEY'] ?? 'sk_test_mock_default';
        return new StripeAdapter({ apiKey });
      }

      case 'airwallex': {
        const clientId = creds['clientId'] ?? process.env['AIRWALLEX_CLIENT_ID'] ?? 'mock_awx_id';
        const apiKey = creds['apiKey'] ?? process.env['AIRWALLEX_API_KEY'] ?? 'mock_awx_key';
        return new AirwallexAdapter({ clientId, apiKey });
      }

      default: {
        // Hot-pluggable dynamic provider: resolve via central registry
        try {
          return this.registry.getAdapter(providerSlug as PaymentProcessorSlug);
        } catch {
          logger.warn(`Unknown provider '${providerSlug}', falling back to mock sandbox adapter.`);
          return new MockPaymentProcessorAdapter({
            providerSlug,
            providerDisplayName: `${providerSlug.toUpperCase()} (Sandbox Fallback)`,
          });
        }
      }
    }
  }

  /**
   * Returns list of all available processors and capability metadata.
   */
  public listAvailableProcessors(): ProcessorMetadata[] {
    return this.registry.listAllProcessors();
  }

  /**
   * Executes an operation strictly against the unified PaymentProcessorAdapter interface
   * without any provider-specific branching.
   */
  public async executeOperation<T>(
    providerSlug: string,
    operation: (adapter: PaymentProcessorAdapter) => Promise<T>,
    options?: ProcessorFactoryOptions
  ): Promise<T> {
    const adapter = this.getAdapter(providerSlug, options);
    return operation(adapter);
  }
}

export const processorFactory = PaymentProcessorFactory.getInstance();
