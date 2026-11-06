// path: types/processors.ts

import type { PaymentProcessorAdapter } from '@/lib/processors/types';

export type PaymentProcessorSlug =
  | 'nmi'
  | 'payoneer'
  | 'rainforest'
  | 'stripe_connect'
  | 'airwallex';

export interface ProcessorCapabilities {
  /** Supports card acceptance (Visa, Mastercard, Amex, Discover) */
  cardAcceptance: boolean;
  /** Supports e-wallets (Apple Pay, Google Pay) */
  eWallets: boolean;
  /** Supports direct sub-merchant account onboarding / provisioning */
  subMerchantCreation: boolean;
  /** Supports programmatic merchant balance payouts (ACH, Wire, Local rails) */
  payouts: boolean;
  /** Supports hosted tokenization fields (PCI DSS SAQ A / SAQ A-EP) */
  hostedFields: boolean;
  /** Supports recurring billing / card-on-file subscriptions */
  recurringBilling: boolean;
  /** Supports level 2 / level 3 B2B transaction data */
  level2Level3Data: boolean;
  /** Supports 3D Secure 2.0 authentication */
  threeDSecure: boolean;
}

export interface ProcessorMetadata {
  slug: PaymentProcessorSlug;
  displayName: string;
  description: string;
  websiteUrl: string;
  documentationUrl: string;
  capabilities: ProcessorCapabilities;
  /** ISO-3166-1 alpha-2 country codes where the processor operates */
  supportedCountries: readonly string[];
  /** Primary settlement and transaction currencies supported */
  supportedCurrencies: readonly string[];
  /** Supported integration methods (e.g. Collect.js, Elements, Direct API) */
  clientLibraries: readonly string[];
  /** Whether the gateway is officially active and ready for routing in production */
  isEnabled: boolean;
  /** Priority ordering for default routing consideration */
  defaultPriority: number;
}

export interface ProcessorRegistryEntry {
  metadata: ProcessorMetadata;
  adapterFactory: () => PaymentProcessorAdapter;
}
