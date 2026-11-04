// path: lib/kyb/schemas/index.ts

import { z } from 'zod';

export type PaymentProcessorId =
  | 'nmi'
  | 'stripe_connect'
  | 'rainforest'
  | 'airwallex'
  | 'payoneer';

export const PaymentProcessorIdSchema = z.enum([
  'nmi',
  'stripe_connect',
  'rainforest',
  'airwallex',
  'payoneer',
]);

/**
 * Common Canonical KYB Business Profile Schema across all payment processors.
 */
export const BaseBusinessProfileSchema = z.object({
  legalBusinessName: z.string().min(2, 'Legal business name must be at least 2 characters'),
  dbaName: z.string().optional(),
  taxId: z.string().min(9, 'Tax ID / EIN must be at least 9 digits'),
  businessType: z.enum(['llc', 'corporation', 'partnership', 'sole_proprietorship']),
  incorporationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Incorporation date must be in YYYY-MM-DD format'),
  streetAddress: z.string().min(5, 'Street address must be at least 5 characters'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State / Province is required'),
  postalCode: z.string().min(3, 'Postal code is required'),
  country: z.string().length(2, 'Country must be a 2-letter ISO code'),
  websiteUrl: z.string().url('A valid website URL is required'),
  supportPhone: z.string().min(10, 'A valid support telephone number is required'),
  supportEmail: z.string().email('A valid support email is required'),
});

export type BaseBusinessProfile = z.infer<typeof BaseBusinessProfileSchema>;

/**
 * NMI Collect.js / Direct Underwriting Requirements:
 * Requires ticket metrics and monthly volume projections for risk configuration.
 */
export const NmiProfileSchema = BaseBusinessProfileSchema.extend({
  nmiMerchantCategory: z.string().min(2, 'NMI Industry Category is required'),
  estimatedMonthlyVolumeUsd: z.number().positive('Estimated monthly volume must be greater than 0'),
  averageTicketUsd: z.number().positive('Average ticket size must be greater than 0'),
  maxTicketUsd: z.number().positive('Maximum ticket size must be greater than 0'),
  gatewayUsernameRequested: z.string().min(3, 'Requested gateway API username must be at least 3 characters'),
});

export type NmiBusinessProfile = z.infer<typeof NmiProfileSchema>;

/**
 * Stripe Connect Custom Underwriting Requirements:
 * Requires MCC code, business narrative, and executive representative designation.
 */
export const StripeConnectProfileSchema = BaseBusinessProfileSchema.extend({
  stripeMcc: z.string().length(4, 'Stripe MCC must be an exact 4-digit code'),
  representativeTitle: z.string().min(2, 'Executive title is required'),
  businessDescription: z.string().min(10, 'Business description must be at least 10 characters'),
});

export type StripeConnectBusinessProfile = z.infer<typeof StripeConnectProfileSchema>;

/**
 * Rainforest Embedded Payments Underwriting Requirements:
 * Requires Payor identifier and ACH settlement account coordinates.
 */
export const RainforestProfileSchema = BaseBusinessProfileSchema.extend({
  rainforestPlatformPayorId: z.string().min(3, 'Rainforest Platform Payor ID is required'),
  bankRoutingNumber: z.string().min(9, 'A valid 9-digit ACH routing number is required'),
  bankAccountNumber: z.string().min(4, 'A valid bank account number is required'),
});

export type RainforestBusinessProfile = z.infer<typeof RainforestProfileSchema>;

/**
 * Airwallex Global Multi-Currency Underwriting Requirements:
 * Requires target settlement currency array and cross-border geographic corridors.
 */
export const AirwallexProfileSchema = BaseBusinessProfileSchema.extend({
  airwallexSettlementCurrencies: z
    .array(z.string().length(3))
    .min(1, 'At least one settlement currency is required (e.g. USD, EUR)'),
  crossBorderCorridors: z
    .array(z.string().length(2))
    .min(1, 'At least one international trade corridor is required'),
});

export type AirwallexBusinessProfile = z.infer<typeof AirwallexProfileSchema>;

/**
 * Payoneer Global Mass Payout Underwriting Requirements:
 * Requires Payoneer merchant registration payee identifier and destination country.
 */
export const PayoneerProfileSchema = BaseBusinessProfileSchema.extend({
  payoneerPayeeId: z.string().min(3, 'Payoneer Payee ID is required'),
  primaryBeneficiaryCountry: z.string().length(2, 'Primary beneficiary country is required'),
});

export type PayoneerBusinessProfile = z.infer<typeof PayoneerProfileSchema>;

export type ProcessorBusinessProfile =
  | NmiBusinessProfile
  | StripeConnectBusinessProfile
  | RainforestBusinessProfile
  | AirwallexBusinessProfile
  | PayoneerBusinessProfile;

export interface ProcessorFieldMetadata {
  fieldName: string;
  label: string;
  type: 'text' | 'number' | 'array' | 'select';
  placeholder?: string;
  description: string;
  required: boolean;
}

/**
 * Returns dynamic UI metadata for fields required by the given processor beyond base fields.
 */
export function getProcessorDynamicFields(
  processor: PaymentProcessorId
): ProcessorFieldMetadata[] {
  switch (processor) {
    case 'nmi':
      return [
        {
          fieldName: 'nmiMerchantCategory',
          label: 'NMI Industry Classification',
          type: 'text',
          placeholder: 'e.g. E-Commerce Retail',
          description: 'Merchant classification for NMI Collect.js gateway boarding.',
          required: true,
        },
        {
          fieldName: 'estimatedMonthlyVolumeUsd',
          label: 'Estimated Monthly Processing Volume ($USD)',
          type: 'number',
          placeholder: '50000',
          description: 'Monthly card authorization projection.',
          required: true,
        },
        {
          fieldName: 'averageTicketUsd',
          label: 'Average Ticket Amount ($USD)',
          type: 'number',
          placeholder: '120',
          description: 'Anticipated average checkout order size.',
          required: true,
        },
        {
          fieldName: 'maxTicketUsd',
          label: 'Maximum Ticket Amount ($USD)',
          type: 'number',
          placeholder: '1500',
          description: 'Maximum single card transaction threshold.',
          required: true,
        },
        {
          fieldName: 'gatewayUsernameRequested',
          label: 'Requested Gateway Username',
          type: 'text',
          placeholder: 'merchant_gateway_01',
          description: 'Unique API username for NMI virtual terminal.',
          required: true,
        },
      ];

    case 'stripe_connect':
      return [
        {
          fieldName: 'stripeMcc',
          label: 'Stripe 4-Digit MCC',
          type: 'text',
          placeholder: '5734',
          description: 'Standard card brand Merchant Category Code.',
          required: true,
        },
        {
          fieldName: 'representativeTitle',
          label: 'Representative Executive Title',
          type: 'text',
          placeholder: 'Chief Executive Officer',
          description: 'Official corporate title of signing officer.',
          required: true,
        },
        {
          fieldName: 'businessDescription',
          label: 'Commercial Narrative / Products Sold',
          type: 'text',
          placeholder: 'Cloud-based subscription software solutions...',
          description: 'Detailed description of merchant goods or services.',
          required: true,
        },
      ];

    case 'rainforest':
      return [
        {
          fieldName: 'rainforestPlatformPayorId',
          label: 'Rainforest Platform Payor ID',
          type: 'text',
          placeholder: 'payor_rf_99182',
          description: 'Platform billing entity ID for embedded processing.',
          required: true,
        },
        {
          fieldName: 'bankRoutingNumber',
          label: 'ACH Bank Routing Number (ABA)',
          type: 'text',
          placeholder: '021000021',
          description: '9-digit domestic routing transit number.',
          required: true,
        },
        {
          fieldName: 'bankAccountNumber',
          label: 'ACH Settlement Bank Account Number',
          type: 'text',
          placeholder: '123456789012',
          description: 'Commercial operating account for daily disbursements.',
          required: true,
        },
      ];

    case 'airwallex':
      return [
        {
          fieldName: 'airwallexSettlementCurrencies',
          label: 'Settlement Currencies (Comma-separated)',
          type: 'text',
          placeholder: 'USD, EUR, GBP',
          description: 'Target settlement currencies for global multi-currency accounts.',
          required: true,
        },
        {
          fieldName: 'crossBorderCorridors',
          label: 'Target Trade Corridors (ISO 2-letter codes)',
          type: 'text',
          placeholder: 'US, GB, DE, SG',
          description: 'Primary customer locations for cross-border acquiring.',
          required: true,
        },
      ];

    case 'payoneer':
      return [
        {
          fieldName: 'payoneerPayeeId',
          label: 'Payoneer Payee ID',
          type: 'text',
          placeholder: 'PAYEE-2026-8812',
          description: 'Payoneer global mass disbursement recipient ID.',
          required: true,
        },
        {
          fieldName: 'primaryBeneficiaryCountry',
          label: 'Primary Beneficiary Country (ISO 2-letter)',
          type: 'text',
          placeholder: 'US',
          description: 'Jurisdiction of recipient commercial entity.',
          required: true,
        },
      ];
  }
}

/**
 * Validates dynamic business profile input against the target processor's Zod schema.
 */
export function validateProcessorBusinessProfile(
  processor: PaymentProcessorId,
  data: unknown
): { success: true; data: ProcessorBusinessProfile } | { success: false; errors: string[] } {
  let schema: z.ZodType<any>;

  switch (processor) {
    case 'nmi':
      schema = NmiProfileSchema;
      break;
    case 'stripe_connect':
      schema = StripeConnectProfileSchema;
      break;
    case 'rainforest':
      schema = RainforestProfileSchema;
      break;
    case 'airwallex':
      schema = AirwallexProfileSchema;
      break;
    case 'payoneer':
      schema = PayoneerProfileSchema;
      break;
  }

  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = (result.error.issues || []).map((e) => `${e.path.join('.')}: ${e.message}`);
  return { success: false, errors };
}

/**
 * Maps a validated profile into the target processor's API payload format.
 */
export function mapCanonicalProfileToProcessorPayload(
  processor: PaymentProcessorId,
  profile: any
): Record<string, unknown> {
  const basePayload = {
    legal_name: profile.legalBusinessName,
    trade_name: profile.dbaName ?? profile.legalBusinessName,
    tax_identifier: profile.taxId,
    entity_structure: profile.businessType,
    incorporation_date: profile.incorporationDate,
    address: {
      line1: profile.streetAddress,
      city: profile.city,
      state: profile.state,
      postal_code: profile.postalCode,
      country: profile.country,
    },
    contact: {
      website: profile.websiteUrl,
      phone: profile.supportPhone,
      email: profile.supportEmail,
    },
  };

  switch (processor) {
    case 'nmi':
      return {
        ...basePayload,
        gateway: 'nmi_collect_js',
        underwriting_parameters: {
          category: profile.nmiMerchantCategory,
          monthly_volume_usd: profile.estimatedMonthlyVolumeUsd,
          avg_ticket_usd: profile.averageTicketUsd,
          max_ticket_usd: profile.maxTicketUsd,
          requested_username: profile.gatewayUsernameRequested,
        },
      };

    case 'stripe_connect':
      return {
        ...basePayload,
        gateway: 'stripe_connect_custom',
        mcc: profile.stripeMcc,
        representative: {
          title: profile.representativeTitle,
        },
        product_description: profile.businessDescription,
      };

    case 'rainforest':
      return {
        ...basePayload,
        gateway: 'rainforest_embedded',
        payor_id: profile.rainforestPlatformPayorId,
        ach_settlement: {
          routing_number: profile.bankRoutingNumber,
          account_number: profile.bankAccountNumber,
        },
      };

    case 'airwallex':
      return {
        ...basePayload,
        gateway: 'airwallex_global',
        settlement_currencies: profile.airwallexSettlementCurrencies,
        corridors: profile.crossBorderCorridors,
      };

    case 'payoneer':
      return {
        ...basePayload,
        gateway: 'payoneer_payouts',
        payee_id: profile.payoneerPayeeId,
        beneficiary_country: profile.primaryBeneficiaryCountry,
      };
  }
}
