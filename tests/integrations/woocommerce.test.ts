// path: tests/integrations/woocommerce.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMerchantApiKey,
  resetApiKeyStore,
} from '@/lib/api/api-keys';
import {
  connectWooCommerceStore,
  disconnectWooCommerceStore,
  verifyWooCommerceStoreHealth,
  getWooCommerceConnection,
  getWooCommerceConnectionForCompany,
  validateSiteUrl,
  resetWooCommerceStore,
} from '@/lib/integrations/woocommerce';

describe('Approved WooCommerce Native Plugin & Auto-Activation Bridge (Step 148)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const merchantStaff = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const validSiteUrl = 'https://electronics-hub.example.com';

  beforeEach(() => {
    resetApiKeyStore();
    resetWooCommerceStore();
  });

  describe('Site URL Validation (Step 148.1)', () => {
    it('validates canonical HTTP/HTTPS site URLs', () => {
      expect(validateSiteUrl('https://my-shop.com')).toBe(true);
      expect(validateSiteUrl('http://staging.shop.org/store')).toBe(true);
      expect(validateSiteUrl('ftp://invalid-protocol.com')).toBe(false);
      expect(validateSiteUrl('not-a-valid-url')).toBe(false);
      expect(validateSiteUrl('')).toBe(false);
    });
  });

  describe('Installation & Auto-Activation Workflow (Step 148.2)', () => {
    it('connects plugin with credentials, auto-activates, and verifies functionality', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantStaff,
      });

      const connection = await connectWooCommerceStore({
        tenantId,
        companyId,
        siteUrl: validSiteUrl,
        merchantApiKey: keyGen.plaintextSecretKey,
        installerUserId: merchantStaff,
        pluginVersion: '1.2.0',
        wcVersion: '8.6.1',
      });

      expect(connection.id).toBeDefined();
      expect(connection.siteUrl).toBe(validSiteUrl);
      expect(connection.status).toBe('active');
      expect(connection.isFunctional).toBe(true);
      expect(connection.pluginVersion).toBe('1.2.0');
      expect(connection.wcVersion).toBe('8.6.1');

      // Verify webhook secret is encrypted
      expect(connection.encryptedWebhookSecret).toBeDefined();
      expect(connection.encryptedWebhookSecret.length).toBeGreaterThan(32);

      // Query lookups
      const fetched = await getWooCommerceConnection(validSiteUrl);
      expect(fetched?.id).toBe(connection.id);

      const byCompany = await getWooCommerceConnectionForCompany(companyId);
      expect(byCompany?.id).toBe(connection.id);
    });

    it('rejects connection if site URL is invalid', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantStaff,
      });

      await expect(
        connectWooCommerceStore({
          tenantId,
          companyId,
          siteUrl: 'invalid-url-string',
          merchantApiKey: keyGen.plaintextSecretKey,
          installerUserId: merchantStaff,
        })
      ).rejects.toThrow(/Invalid WooCommerce site URL/);
    });
  });

  describe('Health Diagnostic & Disconnection Lifecycle (Step 148.3)', () => {
    it('verifies active connection health and decrypts webhook secret successfully', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantStaff,
      });

      await connectWooCommerceStore({
        tenantId,
        companyId,
        siteUrl: validSiteUrl,
        merchantApiKey: keyGen.plaintextSecretKey,
        installerUserId: merchantStaff,
      });

      const health = await verifyWooCommerceStoreHealth(validSiteUrl);
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

      await connectWooCommerceStore({
        tenantId,
        companyId,
        siteUrl: validSiteUrl,
        merchantApiKey: keyGen.plaintextSecretKey,
        installerUserId: merchantStaff,
      });

      const disconnected = await disconnectWooCommerceStore(validSiteUrl, merchantStaff);
      expect(disconnected.status).toBe('uninstalled');
      expect(disconnected.isFunctional).toBe(false);

      const health = await verifyWooCommerceStoreHealth(validSiteUrl);
      expect(health.isHealthy).toBe(false);
      expect(health.status).toBe('uninstalled');
    });
  });
});
