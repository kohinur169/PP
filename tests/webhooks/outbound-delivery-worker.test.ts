// path: tests/webhooks/outbound-delivery-worker.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  signWebhookPayload,
  verifyWebhookSignature,
  executeSingleWebhookDelivery,
  runOutboundWebhookDeliveryBatchJob,
  seedWebhookEndpoint,
  seedWebhookDelivery,
  getWebhookDelivery,
  resetOutboundWebhookStore,
  RETRY_INTERVALS_SECONDS,
} from '@/lib/webhooks/outbound-delivery-worker';

describe('Merchant Outbound Webhook Delivery Worker (Step 167)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const endpointId = 'ep_test_001';
  const webhookSecret = 'whsec_testing_secret_key_12345';

  beforeEach(() => {
    resetOutboundWebhookStore();
  });

  describe('HMAC-SHA256 Signature Verification Invariant (Step 167.1)', () => {
    it('generates valid t=...,v1=... signature header matching Section 15 specifications', () => {
      const timestamp = 1793880000;
      const payloadStr = JSON.stringify({ event: 'payment_intent.succeeded', amount: 500 });

      const header = signWebhookPayload(webhookSecret, timestamp, payloadStr);

      expect(header).toContain(`t=${timestamp},v1=`);

      const isValid = verifyWebhookSignature(webhookSecret, header, payloadStr, 315360000); // broad tolerance for fixed test timestamp
      expect(isValid).toBe(true);

      // Tampered payload fails
      const isTamperedValid = verifyWebhookSignature(
        webhookSecret,
        header,
        JSON.stringify({ event: 'payment_intent.succeeded', amount: 9999 }),
        315360000
      );
      expect(isTamperedValid).toBe(false);

      // Wrong secret fails
      const isWrongSecretValid = verifyWebhookSignature('whsec_different_key', header, payloadStr, 315360000);
      expect(isWrongSecretValid).toBe(false);
    });
  });

  describe('10-Step Exponential Retry Backoff Invariant (Step 167.2)', () => {
    it('verifies exact 10 retry intervals up to 72 hours', () => {
      expect(RETRY_INTERVALS_SECONDS).toEqual([
        1, // 1s
        5, // 5s
        30, // 30s
        300, // 5m
        1800, // 30m
        7200, // 2h
        21600, // 6h
        86400, // 24h
        172800, // 48h
        259200, // 72h
      ]);
    });

    it('schedules next retry according to the backoff ladder and transitions to failed_exhausted after 10 attempts', async () => {
      seedWebhookEndpoint({
        id: endpointId,
        tenantId,
        companyId,
        url: 'https://merchant.test/webhooks',
        subscribedEvents: ['payment_intent.succeeded'],
        secret: webhookSecret,
        isActive: true,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      });

      const deliveryId = 'del_001';
      seedWebhookDelivery({
        id: deliveryId,
        tenantId,
        endpointId,
        eventType: 'payment_intent.succeeded',
        payload: { paymentId: 'pay_123', status: 'succeeded' },
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 10,
        nextAttemptAt: '2026-11-05T12:00:00Z',
        createdAt: '2026-11-05T12:00:00Z',
        updatedAt: '2026-11-05T12:00:00Z',
      });

      // Transport simulation: always returns 500 Internal Server Error
      const failingTransport = async () => ({
        statusCode: 500,
        latencyMs: 120,
        bodySnippet: 'Internal Server Error',
      });

      // Attempt 1: delay = 1 second
      const att1 = await executeSingleWebhookDelivery(deliveryId, failingTransport, '2026-11-05T12:00:00Z');
      expect(att1.status).toBe('retrying');
      expect(att1.attemptCount).toBe(1);
      expect(att1.nextAttemptAt).toBe('2026-11-05T12:00:01.000Z'); // +1s

      // Attempt 2: delay = 5 seconds
      const att2 = await executeSingleWebhookDelivery(deliveryId, failingTransport, '2026-11-05T12:00:01Z');
      expect(att2.status).toBe('retrying');
      expect(att2.attemptCount).toBe(2);
      expect(att2.nextAttemptAt).toBe('2026-11-05T12:00:06.000Z'); // +5s

      // Attempt 3: delay = 30 seconds
      const att3 = await executeSingleWebhookDelivery(deliveryId, failingTransport, '2026-11-05T12:00:06Z');
      expect(att3.attemptCount).toBe(3);
      expect(att3.nextAttemptAt).toBe('2026-11-05T12:00:36.000Z'); // +30s

      // Fast-forward to attempt 9
      const existing = getWebhookDelivery(deliveryId)!;
      existing.attemptCount = 9;

      // Attempt 10: reaches maxAttempts -> marks failed_exhausted
      const att10 = await executeSingleWebhookDelivery(deliveryId, failingTransport, '2026-11-08T12:00:00Z');
      expect(att10.attemptCount).toBe(10);
      expect(att10.status).toBe('failed_exhausted');
    });
  });

  describe('Successful Delivery and Batch Runner (Step 167.3)', () => {
    it('successfully delivers webhook on 200 OK and logs latency and status code', async () => {
      seedWebhookEndpoint({
        id: endpointId,
        tenantId,
        companyId,
        url: 'https://merchant.test/webhooks',
        subscribedEvents: ['refund.created'],
        secret: webhookSecret,
        isActive: true,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      });

      seedWebhookDelivery({
        id: 'del_success_1',
        tenantId,
        endpointId,
        eventType: 'refund.created',
        payload: { refundId: 'ref_999', amount: 45.0 },
        status: 'pending',
        attemptCount: 0,
        maxAttempts: 10,
        nextAttemptAt: '2026-11-05T12:00:00Z',
        createdAt: '2026-11-05T12:00:00Z',
        updatedAt: '2026-11-05T12:00:00Z',
      });

      const successTransport = async () => ({
        statusCode: 200,
        latencyMs: 45,
        bodySnippet: '{"ok": true}',
      });

      const batch = await runOutboundWebhookDeliveryBatchJob({
        tenantId,
        nowIso: '2026-11-05T12:00:05Z',
        transport: successTransport,
      });

      expect(batch.inspectedCount).toBe(1);
      expect(batch.deliveredCount).toBe(1);

      const d = getWebhookDelivery('del_success_1');
      expect(d?.status).toBe('delivered');
      expect(d?.lastStatusCode).toBe(200);
      expect(d?.lastLatencyMs).toBe(45);
      expect(d?.deliveredAt).toBeDefined();
    });
  });
});
