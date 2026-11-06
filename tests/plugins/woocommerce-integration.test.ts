// path: tests/plugins/woocommerce-integration.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  pairWooCommerceStore,
  verifyWooCommerceWebhookHmac,
  handleWooCommerceWebhook,
  recordWooCommerceHeartbeat,
  evaluateWooCommerceStoreHealth,
  decryptWooCommerceSecret,
  resetWooCommerceIntegrationStore,
} from '@/lib/plugins/woocommerce-integration';
import crypto from 'crypto';

describe('WooCommerce Plugin Integration (Section 32 - Step 185)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';
  const siteUrl = 'https://myshop.woocommerce.store';
  const consumerKey = 'ck_9876543210fedcba';
  const consumerSecret = 'cs_secret_wc_hmac_test_key_123';

  beforeEach(() => {
    resetWooCommerceIntegrationStore();
  });

  it('pairs WooCommerce store with consumer key masking and AES-256-GCM secret encryption', async () => {
    const connection = await pairWooCommerceStore({
      tenantId,
      companyId,
      siteUrl,
      consumerKey,
      consumerSecret,
      pluginVersion: '2.4.0',
      wcVersion: '8.2.1',
      branding: {
        title: 'KD Pay Direct Checkout',
        testMode: true,
      },
    });

    expect(connection.id).toBeDefined();
    expect(connection.consumerKeyMasked).toBe('ck_••••••••••••dcba');
    expect(connection.encryptedWebhookSecret).not.toBe(consumerSecret);
    expect(connection.branding.title).toBe('KD Pay Direct Checkout');
    expect(connection.branding.testMode).toBe(true);

    const decrypted = decryptWooCommerceSecret(connection.encryptedWebhookSecret);
    expect(decrypted).toBe(consumerSecret);
  });

  it('verifies valid HMAC-SHA256 signatures and rejects tampered bodies', () => {
    const rawBody = JSON.stringify({ id: 1042, total: '149.99', status: 'completed' });
    const signature = crypto
      .createHmac('sha256', consumerSecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    const isValid = verifyWooCommerceWebhookHmac(rawBody, signature, consumerSecret);
    expect(isValid).toBe(true);

    const isTampered = verifyWooCommerceWebhookHmac(
      rawBody + 'tamper',
      signature,
      consumerSecret
    );
    expect(isTampered).toBe(false);
  });

  it('processes order.created, order.completed and order.refunded webhook topics', async () => {
    await pairWooCommerceStore({
      tenantId,
      companyId,
      siteUrl,
      consumerKey,
      consumerSecret,
      pluginVersion: '2.4.0',
      wcVersion: '8.2.1',
    });

    const createRes = await handleWooCommerceWebhook({
      tenantId,
      siteUrl,
      topic: 'order.created',
      payload: { id: 201, total: '89.50' },
    });
    expect(createRes.actionTaken).toContain('Synchronized WooCommerce order #201');

    const completeRes = await handleWooCommerceWebhook({
      tenantId,
      siteUrl,
      topic: 'order.completed',
      payload: { id: 201 },
    });
    expect(completeRes.actionTaken).toContain('fulfillment gate satisfied');

    const refundRes = await handleWooCommerceWebhook({
      tenantId,
      siteUrl,
      topic: 'order.refunded',
      payload: { id: 201 },
    });
    expect(refundRes.actionTaken).toContain('refund synchronization');
  });

  it('records heartbeat pings and tracks environment telemetry', async () => {
    const connection = await pairWooCommerceStore({
      tenantId,
      companyId,
      siteUrl,
      consumerKey,
      consumerSecret,
      pluginVersion: '2.4.0',
      wcVersion: '8.2.1',
    });

    const updated = await recordWooCommerceHeartbeat({
      tenantId,
      siteUrl,
      pluginVersion: '2.4.1',
      wcVersion: '8.3.0',
      wpVersion: '6.4.2',
      phpVersion: '8.2.10',
    });

    expect(updated.pluginVersion).toBe('2.4.1');
    expect(updated.wcVersion).toBe('8.3.0');
    expect(updated.phpVersion).toBe('8.2.10');
    expect(updated.status).toBe('active');
  });

  it('flags store as degraded when heartbeat exceeds stale threshold', async () => {
    const connection = await pairWooCommerceStore({
      tenantId,
      companyId,
      siteUrl,
      consumerKey,
      consumerSecret,
      pluginVersion: '2.4.0',
      wcVersion: '8.2.1',
    });

    // Simulate stale heartbeat 30 hours ago
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    connection.lastHeartbeatAt = thirtyHoursAgo;

    const health = evaluateWooCommerceStoreHealth(siteUrl);
    expect(health.isHealthy).toBe(false);
    expect(health.status).toBe('degraded');
    expect(health.hoursSinceHeartbeat).toBeGreaterThanOrEqual(30);
  });
});
