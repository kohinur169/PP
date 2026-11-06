// path: tests/plugins/shopify-integration.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  verifyShopifyWebhookHmac,
  pairShopifyStore,
  handleShopifyWebhook,
  getShopifyConnection,
  decryptShopifyAccessToken,
  resetShopifyIntegrationStore,
} from '@/lib/plugins/shopify-integration';

describe('Shopify App Integration, Webhook Handlers & Store Pairing (Step 184)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const shopDomain = 'acme-apparel.myshopify.com';
  const clientSecret = 'test_mock_shopify_client_secret_9988';

  beforeEach(() => {
    resetShopifyIntegrationStore();
  });

  describe('HMAC-SHA256 Signature Verification', () => {
    it('verifies valid HMAC-SHA256 signature generated with client secret', () => {
      const rawBody = JSON.stringify({ id: 12345, event: 'order_created' });
      const validHmac = crypto
        .createHmac('sha256', clientSecret)
        .update(rawBody, 'utf8')
        .digest('base64');

      expect(verifyShopifyWebhookHmac(rawBody, validHmac, clientSecret)).toBe(true);
    });

    it('rejects invalid or tampered HMAC signature', () => {
      const rawBody = JSON.stringify({ id: 12345, event: 'order_created' });
      const tamperedBody = JSON.stringify({ id: 12345, event: 'order_created', hacked: true });
      const validHmac = crypto
        .createHmac('sha256', clientSecret)
        .update(rawBody, 'utf8')
        .digest('base64');

      expect(verifyShopifyWebhookHmac(tamperedBody, validHmac, clientSecret)).toBe(false);
      expect(verifyShopifyWebhookHmac(rawBody, 'INVALID_BASE64_HMAC==', clientSecret)).toBe(false);
    });
  });

  describe('OAuth Store Pairing & Credential Encryption', () => {
    it('pairs store, encrypts access token, and sets status active', async () => {
      const conn = await pairShopifyStore({
        tenantId,
        companyId,
        shopDomain,
        accessToken: 'shpat_mock_shopify_access_token_12345',
        appVersion: '2.4.0',
      });

      expect(conn.shopDomain).toBe('acme-apparel.myshopify.com');
      expect(conn.status).toBe('active');
      expect(conn.isFunctional).toBe(true);

      // Verify domain key decryption
      const decrypted = decryptShopifyAccessToken(conn.encryptedAccessToken);
      expect(decrypted).toBe('shpat_mock_shopify_access_token_12345');
    });
  });

  describe('Webhook Topics & Lifecycle Processing', () => {
    beforeEach(async () => {
      await pairShopifyStore({
        tenantId,
        companyId,
        shopDomain,
        accessToken: 'shpat_mock_shopify_access_token_12345',
      });
    });

    it('processes orders/create and syncs payment intent', async () => {
      const res = await handleShopifyWebhook({
        tenantId,
        shopDomain,
        webhookId: 'wh_order_001',
        topic: 'orders/create',
        payload: { id: 987654, total_price: '149.99', currency: 'USD' },
      });

      expect(res.status).toBe('processed');
      expect(res.actionTaken).toContain('Payment intent synchronized for Shopify order #987654');
    });

    it('processes orders/fulfilled and marks fulfillment gate satisfied', async () => {
      const res = await handleShopifyWebhook({
        tenantId,
        shopDomain,
        webhookId: 'wh_fulfill_002',
        topic: 'orders/fulfilled',
        payload: { id: 987654, fulfillment_status: 'fulfilled' },
      });

      expect(res.actionTaken).toContain('Fulfillment gate satisfied');
    });

    it('processes refunds/create and initiates automatic store refund', async () => {
      const res = await handleShopifyWebhook({
        tenantId,
        shopDomain,
        webhookId: 'wh_refund_003',
        topic: 'refunds/create',
        payload: { id: 554433, order_id: 987654, amount: '50.00' },
      });

      expect(res.actionTaken).toContain('Automatic refund initiated from store admin');
    });

    it('processes app/uninstalled and transitions connection status', async () => {
      const res = await handleShopifyWebhook({
        tenantId,
        shopDomain,
        webhookId: 'wh_uninstall_004',
        topic: 'app/uninstalled',
        payload: { domain: shopDomain },
      });

      expect(res.actionTaken).toContain('Store connection uninstalled');

      const updatedConn = getShopifyConnection(shopDomain)!;
      expect(updatedConn.status).toBe('uninstalled');
      expect(updatedConn.isFunctional).toBe(false);
    });

    it('idempotently handles duplicate webhooks without re-execution', async () => {
      const res1 = await handleShopifyWebhook({
        tenantId,
        shopDomain,
        webhookId: 'wh_idempotent_005',
        topic: 'orders/paid',
        payload: { id: 112233 },
      });

      const res2 = await handleShopifyWebhook({
        tenantId,
        shopDomain,
        webhookId: 'wh_idempotent_005',
        topic: 'orders/paid',
        payload: { id: 112233 },
      });

      expect(res1.id).toBe(res2.id);
    });
  });
});
