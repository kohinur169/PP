// path: tests/integrations/shopify.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMerchantApiKey,
  resetApiKeyStore,
} from '@/lib/api/api-keys';
import {
  connectShopifyStore,
  disconnectShopifyStore,
  verifyShopifyStoreHealth,
  getShopifyConnection,
  getShopifyConnectionForCompany,
  validateShopDomain,
  resetShopifyStore,
} from '@/lib/integrations/shopify';

describe('Approved Shopify App Integration & Auto-Activation Bridge (Step 147)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const merchantStaff = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const validDomain = 'boutique-apparel.myshopify.com';

  beforeEach(() => {
    resetApiKeyStore();
    resetShopifyStore();
  });

  describe('Shop Domain Validation (Step 147.1)', () => {
    it('validates canonical myshopify.com domains', () => {
      expect(validateShopDomain('my-store.myshopify.com')).toBe(true);
      expect(validateShopDomain('boutique-apparel-123.myshopify.com')).toBe(true);
      expect(validateShopDomain('invalid-domain.com')).toBe(false);
      expect(validateShopDomain('shopify.com')).toBe(false);
      expect(validateShopDomain('')).toBe(false);
    });
  });

  describe('Installation & Auto-Activation Workflow (Step 147.2)', () => {
    it('installs app, verifies credentials, and automatically marks connection active and functional', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantStaff,
      });

      const connection = await connectShopifyStore({
        tenantId,
        companyId,
        shopDomain: validDomain,
        merchantApiKey: keyGen.plaintextSecretKey,
        accessToken: 'shpat_mock_shopify_access_token_sec_12345',
        installerUserId: merchantStaff,
      });

      expect(connection.id).toBeDefined();
      expect(connection.shopDomain).toBe(validDomain);
      expect(connection.status).toBe('active');
      expect(connection.isFunctional).toBe(true);
      expect(connection.webhookRegistered).toBe(true);

      // Verify access token is stored encrypted
      expect(connection.encryptedAccessToken).not.toContain('shpat_mock_shopify_access_token_sec_12345');
      expect(connection.encryptedAccessToken.length).toBeGreaterThan(32);

      // Query lookups
      const fetched = await getShopifyConnection(validDomain);
      expect(fetched?.id).toBe(connection.id);

      const byCompany = await getShopifyConnectionForCompany(companyId);
      expect(byCompany?.id).toBe(connection.id);
    });

    it('rejects connection if domain is invalid', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantStaff,
      });

      await expect(
        connectShopifyStore({
          tenantId,
          companyId,
          shopDomain: 'not-a-shopify-store.com',
          merchantApiKey: keyGen.plaintextSecretKey,
          accessToken: 'shpat_token',
          installerUserId: merchantStaff,
        })
      ).rejects.toThrow(/Invalid Shopify domain/);
    });
  });

  describe('Health Diagnostic & Disconnection Lifecycle (Step 147.3)', () => {
    it('verifies active connection health and decrypts credential successfully', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantStaff,
      });

      await connectShopifyStore({
        tenantId,
        companyId,
        shopDomain: validDomain,
        merchantApiKey: keyGen.plaintextSecretKey,
        accessToken: 'shpat_healthy_token_abc',
        installerUserId: merchantStaff,
      });

      const health = await verifyShopifyStoreHealth(validDomain);
      expect(health.isHealthy).toBe(true);
      expect(health.isFunctional).toBe(true);
      expect(health.status).toBe('active');
    });

    it('disconnects store, marks uninstalled and updates health check to unhealthy', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantStaff,
      });

      await connectShopifyStore({
        tenantId,
        companyId,
        shopDomain: validDomain,
        merchantApiKey: keyGen.plaintextSecretKey,
        accessToken: 'shpat_token_test',
        installerUserId: merchantStaff,
      });

      const disconnected = await disconnectShopifyStore(validDomain, merchantStaff);
      expect(disconnected.status).toBe('uninstalled');
      expect(disconnected.isFunctional).toBe(false);

      const health = await verifyShopifyStoreHealth(validDomain);
      expect(health.isHealthy).toBe(false);
      expect(health.status).toBe('uninstalled');
    });
  });
});
