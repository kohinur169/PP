// path: tests/kyb/schemas.test.ts

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getProcessorDynamicFields,
  validateProcessorBusinessProfile,
  mapCanonicalProfileToProcessorPayload,
  BaseBusinessProfile,
} from '@/lib/kyb/schemas';

describe('Step 092: Dynamic Processor-Driven Business Profile Form Engine', () => {
  const validBaseProfile: BaseBusinessProfile = {
    legalBusinessName: 'Aero Dynamics Global Systems LLC',
    dbaName: 'Aero Pay',
    taxId: '12-3456789',
    businessType: 'llc',
    incorporationDate: '2021-06-20',
    streetAddress: '100 Financial Way, Suite 400',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
    websiteUrl: 'https://aerodynamics.example.com',
    supportPhone: '+1 (555) 234-5678',
    supportEmail: 'support@aerodynamics.example.com',
  };

  describe('Step 092.1: Processor-Specific Dynamic Field Schemas', () => {
    it('returns exact NMI Collect.js field requirements', () => {
      const fields = getProcessorDynamicFields('nmi');
      const names = fields.map((f) => f.fieldName);

      expect(names).toContain('nmiMerchantCategory');
      expect(names).toContain('estimatedMonthlyVolumeUsd');
      expect(names).toContain('averageTicketUsd');
      expect(names).toContain('maxTicketUsd');
      expect(names).toContain('gatewayUsernameRequested');
    });

    it('returns exact Stripe Connect Custom field requirements', () => {
      const fields = getProcessorDynamicFields('stripe_connect');
      const names = fields.map((f) => f.fieldName);

      expect(names).toContain('stripeMcc');
      expect(names).toContain('representativeTitle');
      expect(names).toContain('businessDescription');
    });

    it('returns exact Rainforest Embedded PayFac field requirements', () => {
      const fields = getProcessorDynamicFields('rainforest');
      const names = fields.map((f) => f.fieldName);

      expect(names).toContain('rainforestPlatformPayorId');
      expect(names).toContain('bankRoutingNumber');
      expect(names).toContain('bankAccountNumber');
    });

    it('returns exact Airwallex Multi-Currency field requirements', () => {
      const fields = getProcessorDynamicFields('airwallex');
      const names = fields.map((f) => f.fieldName);

      expect(names).toContain('airwallexSettlementCurrencies');
      expect(names).toContain('crossBorderCorridors');
    });

    it('returns exact Payoneer Payout field requirements', () => {
      const fields = getProcessorDynamicFields('payoneer');
      const names = fields.map((f) => f.fieldName);

      expect(names).toContain('payoneerPayeeId');
      expect(names).toContain('primaryBeneficiaryCountry');
    });
  });

  describe('Step 092.2: Dynamic Schema Validation Enforcement', () => {
    it('approves compliant NMI business profile and rejects missing volume metrics', () => {
      const validNmiData = {
        ...validBaseProfile,
        nmiMerchantCategory: 'SaaS Software',
        estimatedMonthlyVolumeUsd: 75000,
        averageTicketUsd: 150,
        maxTicketUsd: 2500,
        gatewayUsernameRequested: 'aero_api_user',
      };

      const result = validateProcessorBusinessProfile('nmi', validNmiData);
      expect(result.success).toBe(true);

      const invalidNmiData = {
        ...validBaseProfile,
        // Missing ticket metrics and volume
      };

      const invalidResult = validateProcessorBusinessProfile('nmi', invalidNmiData);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.errors.some((e) => e.includes('estimatedMonthlyVolumeUsd'))).toBe(true);
      }
    });

    it('approves compliant Stripe Connect profile and rejects invalid MCC length', () => {
      const validStripeData = {
        ...validBaseProfile,
        stripeMcc: '5734',
        representativeTitle: 'Chief Executive Officer',
        businessDescription: 'SaaS software and cloud infrastructure solutions.',
      };

      const result = validateProcessorBusinessProfile('stripe_connect', validStripeData);
      expect(result.success).toBe(true);

      const invalidMccData = {
        ...validStripeData,
        stripeMcc: '573', // Invalid length (must be 4)
      };

      const invalidResult = validateProcessorBusinessProfile('stripe_connect', invalidMccData);
      expect(invalidResult.success).toBe(false);
      if (!invalidResult.success) {
        expect(invalidResult.errors.some((e) => e.includes('stripeMcc'))).toBe(true);
      }
    });

    it('approves compliant Rainforest profile with ACH coordinates', () => {
      const validRfData = {
        ...validBaseProfile,
        rainforestPlatformPayorId: 'rf_payor_99182',
        bankRoutingNumber: '021000021',
        bankAccountNumber: '123456789012',
      };

      const result = validateProcessorBusinessProfile('rainforest', validRfData);
      expect(result.success).toBe(true);
    });

    it('approves compliant Airwallex profile with multi-currency corridors', () => {
      const validAwData = {
        ...validBaseProfile,
        airwallexSettlementCurrencies: ['USD', 'EUR', 'GBP'],
        crossBorderCorridors: ['US', 'GB', 'DE', 'SG'],
      };

      const result = validateProcessorBusinessProfile('airwallex', validAwData);
      expect(result.success).toBe(true);
    });
  });

  describe('Step 092.3: Canonical to Processor Payload Transformation', () => {
    it('maps canonical profile into gateway-specific API payload structures', () => {
      const stripeData = {
        ...validBaseProfile,
        stripeMcc: '5734',
        representativeTitle: 'Chief Executive Officer',
        businessDescription: 'Enterprise software platform.',
      };

      const payload = mapCanonicalProfileToProcessorPayload('stripe_connect', stripeData);

      expect(payload.gateway).toBe('stripe_connect_custom');
      expect(payload.legal_name).toBe('Aero Dynamics Global Systems LLC');
      expect(payload.mcc).toBe('5734');
      expect((payload.representative as any).title).toBe('Chief Executive Officer');
    });
  });

  describe('Step 092.4: Onboarding Form Route Verification', () => {
    it('verifies public/merchant onboarding page exists at app/(merchant)/onboarding/business-profile/page.tsx', () => {
      const pagePath = path.join(process.cwd(), 'app/(merchant)/onboarding/business-profile/page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('Dynamic Processor-Driven Business Profile');
      expect(content).toContain('Section 1: General Business Identity');
      expect(content).toContain('Section 2: Dynamic Requirements');
      expect(content).toContain('Stripe Connect');
      expect(content).toContain('NMI (Collect.js)');
    });
  });
});
