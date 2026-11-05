// path: tests/processors/nmi-submerchant.test.ts

import { describe, it, expect, vi } from 'vitest';
import {
  createNmiSubMerchant,
  buildNmiPartnerPayload,
  encryptNmiCredentials,
  decryptNmiCredentials,
  NmiMerchantProvisioningInput,
} from '@/lib/processors/nmi-submerchant';
import { GatewayAuthError, GatewayInvalidRequestError } from '@/lib/processors/types';

describe('Step 114: NMI Sub-Merchant Gateway Provisioning Client', () => {
  const sampleInput: NmiMerchantProvisioningInput = {
    tenantId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
    companyId: '01a1aa91-3500-7fa1-b1e2-987654321def',
    legalBusinessName: 'Apex Commerce Solutions LLC',
    dbaName: 'Apex Store',
    taxId: '12-3456789',
    mcc: '5411',
    representative: {
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@apex.io',
      phone: '+15551234567',
      address1: '123 Market St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    },
    processingLimits: {
      monthlyVolumeUsd: 250000,
      maxTicketUsd: 10000,
    },
  };

  describe('Step 114.1: Partner API Payload Formulation', () => {
    it('constructs correct NMI affiliate JSON payload matching official spec', () => {
      const payload = buildNmiPartnerPayload(sampleInput);

      expect(payload.merchant.company).toBe('Apex Commerce Solutions LLC');
      expect(payload.merchant.dba).toBe('Apex Store');
      expect(payload.merchant.tax_id).toBe('123456789'); // Stripped punctuation
      expect(payload.merchant.mcc).toBe('5411');
      expect(payload.merchant.contact.email).toBe('alice@apex.io');
      expect(payload.merchant.contact.postal_code).toBe('94105');
      expect(payload.merchant.limits.monthly_volume).toBe(250000);
      expect(payload.merchant.limits.max_ticket).toBe(10000);
    });
  });

  describe('Step 114.2: Credential Encryption at Rest', () => {
    it('encrypts and decrypts sub-merchant API keys using AES-256-GCM authenticated with companyId', () => {
      const plainApiKey = 'nmi_sec_live_9981248018247018240';
      const companyId = sampleInput.companyId;

      const encrypted = encryptNmiCredentials(plainApiKey, companyId);
      expect(encrypted).not.toContain(plainApiKey);
      expect(encrypted).toContain('v1:'); // Encrypted envelope prefix

      const decrypted = decryptNmiCredentials(encrypted, companyId);
      expect(decrypted).toBe(plainApiKey);
    });

    it('fails to decrypt if tampered or wrong company context', () => {
      const plainApiKey = 'nmi_sec_live_9981248018247018240';
      const companyId = sampleInput.companyId;
      const otherCompanyId = '01a1aa91-3500-7fa1-b1e2-000000000000';

      const encrypted = encryptNmiCredentials(plainApiKey, companyId);
      expect(() => decryptNmiCredentials(encrypted, otherCompanyId)).toThrow();
    });
  });

  describe('Step 114.3: Sub-Merchant Creation Workflow', () => {
    it('successfully provisions sub-merchant with live mock endpoint and returns active credentials', async () => {
      const result = await createNmiSubMerchant({
        ...sampleInput,
        partnerSecurityKey: 'mock_partner_key',
        partnerApiUrl: 'mock://secure.nmi.com/api',
      });

      expect(result.id).toBeDefined();
      expect(result.companyId).toBe(sampleInput.companyId);
      expect(result.status).toBe('active');
      expect(result.providerSubmerchantId).toMatch(/^nmi_aff_/);
      expect(result.encryptedApiKey).toBeDefined();
      expect(result.capabilities.card_payments).toBe(true);
      expect(result.capabilities.payouts).toBe(false);

      // Verify returned encrypted key can be decrypted back
      const decrypted = decryptNmiCredentials(result.encryptedApiKey, sampleInput.companyId);
      expect(decrypted).toMatch(/^nmi_sec_sub_/);
    });

    it('handles remote HTTP API response and parses gateway credentials', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          merchant_id: 'nmi_mid_prod_99182',
          username: 'user_apex_store',
          security_key: 'nmi_sec_generated_9921',
        }),
      });

      const result = await createNmiSubMerchant({
        ...sampleInput,
        partnerSecurityKey: 'real_nmi_partner_key',
        partnerApiUrl: 'https://secure.nmi.com/api/v2/affiliate/merchants',
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      expect(mockHttpClient).toHaveBeenCalledTimes(1);
      expect(result.providerSubmerchantId).toBe('nmi_mid_prod_99182');
      expect(result.username).toBe('user_apex_store');

      const decrypted = decryptNmiCredentials(result.encryptedApiKey, sampleInput.companyId);
      expect(decrypted).toBe('nmi_sec_generated_9921');
    });

    it('throws GatewayAuthError when partner credentials fail authentication', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized partner security key',
      });

      await expect(
        createNmiSubMerchant({
          ...sampleInput,
          partnerSecurityKey: 'invalid_key',
          partnerApiUrl: 'https://secure.nmi.com/api/v2/affiliate/merchants',
          httpClient: mockHttpClient as unknown as typeof fetch,
        })
      ).rejects.toThrow(GatewayAuthError);
    });

    it('throws GatewayInvalidRequestError if required fields are missing', async () => {
      await expect(
        createNmiSubMerchant({
          ...sampleInput,
          taxId: '',
        })
      ).rejects.toThrow(GatewayInvalidRequestError);
    });
  });
});
