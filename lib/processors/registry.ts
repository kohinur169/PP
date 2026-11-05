// path: lib/processors/registry.ts

import type { PaymentProcessorAdapter } from '@/lib/processors/types';
import { MockPaymentProcessorAdapter } from '@/lib/processors/mock';
import type {
  PaymentProcessorSlug,
  ProcessorCapabilities,
  ProcessorMetadata,
  ProcessorRegistryEntry,
} from '@/types/processors';

// ============================================================================
// Provider Capability Matrix & Metadata Specifications
// ============================================================================

export const PROCESSOR_CAPABILITY_MATRIX: Record<PaymentProcessorSlug, ProcessorMetadata> = {
  nmi: {
    slug: 'nmi',
    displayName: 'NMI (Network Merchants, LLC)',
    description: 'Enterprise gateway supporting Collect.js tokenization, multi-MID routing, and automated sub-merchant creation.',
    websiteUrl: 'https://nmi.com',
    documentationUrl: 'https://docs.nmi.com',
    capabilities: {
      cardAcceptance: true,
      eWallets: true, // Apple Pay, Google Pay via Collect.js
      subMerchantCreation: true,
      payouts: false, // Core processing gateway; relies on external or partner settlement rails
      hostedFields: true, // Collect.js
      recurringBilling: true,
      level2Level3Data: true,
      threeDSecure: true,
    },
    supportedCountries: ['US', 'CA', 'GB', 'EU', 'AU', 'NZ'],
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    clientLibraries: ['Collect.js', 'Customer Vault API', 'Direct Post API'],
    isEnabled: true,
    defaultPriority: 10,
  },
  payoneer: {
    slug: 'payoneer',
    displayName: 'Payoneer',
    description: 'Global cross-border payout engine supporting mass payouts to 190+ countries and multi-currency virtual accounts.',
    websiteUrl: 'https://payoneer.com',
    documentationUrl: 'https://developer.payoneer.com',
    capabilities: {
      cardAcceptance: false, // Dedicated payout & settlement engine in this architecture
      eWallets: false,
      subMerchantCreation: false,
      payouts: true, // Core capability
      hostedFields: false,
      recurringBilling: false,
      level2Level3Data: false,
      threeDSecure: false,
    },
    supportedCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'AU', 'SG', 'HK', 'JP', 'IN', 'BD', 'PK', 'NG', 'BR', 'MX', 'ZA'],
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
    clientLibraries: ['Payoneer Mass Payout API v4'],
    isEnabled: true,
    defaultPriority: 30,
  },
  rainforest: {
    slug: 'rainforest',
    displayName: 'Rainforest Pay',
    description: 'Modern vertical SaaS PayFac platform providing embedded onboarding, processing, and merchant accounting.',
    websiteUrl: 'https://rainforestpay.com',
    documentationUrl: 'https://docs.rainforestpay.com',
    capabilities: {
      cardAcceptance: true,
      eWallets: true,
      subMerchantCreation: true,
      payouts: true, // Embedded merchant ACH/push-to-card payouts
      hostedFields: true, // Rainforest Component Library
      recurringBilling: true,
      level2Level3Data: false,
      threeDSecure: true,
    },
    supportedCountries: ['US', 'CA'],
    supportedCurrencies: ['USD', 'CAD'],
    clientLibraries: ['Rainforest Components', 'Rainforest REST API'],
    isEnabled: true,
    defaultPriority: 20,
  },
  stripe_connect: {
    slug: 'stripe_connect',
    displayName: 'Stripe Connect',
    description: 'Full-stack embedded payments infrastructure supporting card acceptance, global digital wallets, and automated sub-merchant onboarding.',
    websiteUrl: 'https://stripe.com/connect',
    documentationUrl: 'https://stripe.com/docs/connect',
    capabilities: {
      cardAcceptance: true,
      eWallets: true, // Apple Pay, Google Pay, Link
      subMerchantCreation: true,
      payouts: true, // Connect standard & express payouts
      hostedFields: true, // Stripe Elements
      recurringBilling: true,
      level2Level3Data: true,
      threeDSecure: true,
    },
    supportedCountries: ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'IT', 'AU', 'NZ', 'SG', 'JP', 'NL', 'IE', 'SE', 'NO', 'DK', 'FI', 'AT', 'BE', 'CH', 'PT'],
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SGD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'NZD'],
    clientLibraries: ['Stripe.js', 'Stripe Elements', 'Stripe API 2024-10-28'],
    isEnabled: true,
    defaultPriority: 10,
  },
  airwallex: {
    slug: 'airwallex',
    displayName: 'Airwallex',
    description: 'Global financial infrastructure provider enabling multi-currency acquiring, global accounts, and local clearing payouts.',
    websiteUrl: 'https://airwallex.com',
    documentationUrl: 'https://www.airwallex.com/docs',
    capabilities: {
      cardAcceptance: true,
      eWallets: true, // Apple Pay, Google Pay, WeChat Pay, Alipay
      subMerchantCreation: true, // Connected Accounts
      payouts: true, // Global payout network via local clearing
      hostedFields: true, // Airwallex Drop-in / Elements
      recurringBilling: true,
      level2Level3Data: false,
      threeDSecure: true,
    },
    supportedCountries: ['US', 'CA', 'GB', 'AU', 'SG', 'HK', 'NZ', 'DE', 'FR', 'NL', 'JP'],
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'AUD', 'HKD', 'SGD', 'JPY', 'CAD', 'NZD', 'CNY'],
    clientLibraries: ['Airwallex Web SDK', 'Airwallex Scale API'],
    isEnabled: true,
    defaultPriority: 25,
  },
};

// ============================================================================
// Payment Processor Registry Implementation
// ============================================================================

export class PaymentProcessorRegistry {
  private static instance: PaymentProcessorRegistry | null = null;
  private readonly entries: Map<PaymentProcessorSlug, ProcessorRegistryEntry> = new Map();
  private readonly adapterInstances: Map<PaymentProcessorSlug, PaymentProcessorAdapter> = new Map();

  private constructor() {
    this.registerDefaults();
  }

  public static getInstance(): PaymentProcessorRegistry {
    if (!PaymentProcessorRegistry.instance) {
      PaymentProcessorRegistry.instance = new PaymentProcessorRegistry();
    }
    return PaymentProcessorRegistry.instance;
  }

  /**
   * Resets the singleton instance (useful for test isolation).
   */
  public static resetInstance(): void {
    PaymentProcessorRegistry.instance = null;
  }

  /**
   * Register default adapter factories.
   * Note: In Phase 8 Steps 113-125, concrete adapters for NMI, Stripe, Rainforest,
   * Airwallex, and Payoneer are built. When instantiating through the registry,
   * they default to their respective adapter or Mock adapter fallback until loaded.
   */
  private registerDefaults(): void {
    const slugs: PaymentProcessorSlug[] = [
      'nmi',
      'payoneer',
      'rainforest',
      'stripe_connect',
      'airwallex',
    ];

    for (const slug of slugs) {
      const metadata = PROCESSOR_CAPABILITY_MATRIX[slug];
      this.entries.set(slug, {
        metadata,
        adapterFactory: () =>
          new MockPaymentProcessorAdapter({
            providerSlug: slug,
            providerDisplayName: metadata.displayName,
          }),
      });
    }
  }

  /**
   * Registers or updates an adapter implementation and metadata.
   */
  public register(
    slug: PaymentProcessorSlug,
    adapterFactory: () => PaymentProcessorAdapter,
    metadataOverrides?: Partial<ProcessorMetadata>
  ): void {
    const existing = PROCESSOR_CAPABILITY_MATRIX[slug];
    const metadata: ProcessorMetadata = {
      ...existing,
      ...metadataOverrides,
      slug,
    };

    this.entries.set(slug, {
      metadata,
      adapterFactory,
    });
    // Invalidate cached instance if replacing factory
    this.adapterInstances.delete(slug);
  }

  /**
   * Retrieves an adapter instance for a given processor slug.
   * Returns cached singleton per slug or instantiates via registered factory.
   */
  public getAdapter(slug: PaymentProcessorSlug): PaymentProcessorAdapter {
    const entry = this.entries.get(slug);
    if (!entry) {
      throw new Error(`Unsupported payment processor: '${slug}'. Registered providers: ${Array.from(this.entries.keys()).join(', ')}`);
    }

    let instance = this.adapterInstances.get(slug);
    if (!instance) {
      instance = entry.adapterFactory();
      this.adapterInstances.set(slug, instance);
    }

    return instance;
  }

  /**
   * Returns metadata and capability details for a specific processor.
   */
  public getMetadata(slug: PaymentProcessorSlug): ProcessorMetadata {
    const entry = this.entries.get(slug);
    if (!entry) {
      throw new Error(`Payment processor metadata not found for slug: '${slug}'`);
    }
    return entry.metadata;
  }

  /**
   * Returns all registered processor metadata entries.
   */
  public listAllProcessors(): ProcessorMetadata[] {
    return Array.from(this.entries.values()).map((e) => e.metadata);
  }

  /**
   * Query available processors filtered by country and required capabilities.
   */
  public getAvailableProcessors(params?: {
    country?: string | undefined;
    capability?: keyof ProcessorCapabilities | undefined;
    capabilities?: (keyof ProcessorCapabilities)[] | undefined;
    currency?: string | undefined;
    enabledOnly?: boolean | undefined;
  }): ProcessorMetadata[] {
    const { country, capability, capabilities, currency, enabledOnly = true } = params ?? {};

    const requiredCaps: (keyof ProcessorCapabilities)[] = [];
    if (capability) {
      requiredCaps.push(capability);
    }
    if (capabilities) {
      requiredCaps.push(...capabilities);
    }

    return Array.from(this.entries.values())
      .map((e) => e.metadata)
      .filter((meta) => {
        if (enabledOnly && !meta.isEnabled) {
          return false;
        }

        if (country) {
          const upperCountry = country.toUpperCase();
          const matches = meta.supportedCountries.some((c) => c.toUpperCase() === upperCountry);
          if (!matches) {
            return false;
          }
        }

        if (currency) {
          const upperCurrency = currency.toUpperCase();
          const matches = meta.supportedCurrencies.some((c) => c.toUpperCase() === upperCurrency);
          if (!matches) {
            return false;
          }
        }

        for (const reqCap of requiredCaps) {
          if (!meta.capabilities[reqCap]) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => a.defaultPriority - b.defaultPriority);
  }
}

/**
 * Export default shared singleton instance for standard gateway operations.
 */
export const processorRegistry = PaymentProcessorRegistry.getInstance();
