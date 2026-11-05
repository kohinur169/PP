// path: tests/webhooks/router.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/webhooks/payment/[provider]/route';
import {
  clearWebhookQueue,
  getEnqueuedWebhookEvents,
  registerWebhookHandler,
  normalizeProviderSlug,
  type WebhookEventEnvelope,
} from '@/lib/webhooks/dispatcher';

describe('Multi-Provider Webhook Ingestion Router & Payload Dispatcher (Step 126)', () => {
  const defaultSecret = 'whsec_test_mock_secret';

  beforeEach(() => {
    clearWebhookQueue();
    process.env['STRIPE_WEBHOOK_SECRET'] = defaultSecret;
    process.env['NMI_WEBHOOK_SECRET'] = defaultSecret;
    process.env['RAINFOREST_WEBHOOK_SECRET'] = defaultSecret;
    process.env['AIRWALLEX_WEBHOOK_SECRET'] = defaultSecret;
    process.env['PAYONEER_WEBHOOK_SECRET'] = defaultSecret;
  });

  function createHmacSignature(rawBody: string, secret = defaultSecret): string {
    return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  }

  function createStripeSignature(rawBody: string, secret = defaultSecret): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  describe('Provider Slug Validation (Step 126.1)', () => {
    it('normalizes valid provider slugs properly', () => {
      expect(normalizeProviderSlug('stripe')).toBe('stripe_connect');
      expect(normalizeProviderSlug('stripe_connect')).toBe('stripe_connect');
      expect(normalizeProviderSlug('nmi')).toBe('nmi');
      expect(normalizeProviderSlug('rainforest')).toBe('rainforest');
      expect(normalizeProviderSlug('airwallex')).toBe('airwallex');
      expect(normalizeProviderSlug('payoneer')).toBe('payoneer');
      expect(normalizeProviderSlug('unknown_provider')).toBeNull();
    });

    it('rejects unsupported provider slugs with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/payment/unsupported_gateway', {
        method: 'POST',
        body: JSON.stringify({ event: 'ping' }),
      });

      const res = await POST(req, { params: { provider: 'unsupported_gateway' } });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain("Invalid or unsupported payment provider slug: 'unsupported_gateway'");
    });
  });

  describe('Signature Verification Security Guard', () => {
    it('rejects webhooks with missing or invalid signatures with HTTP 401', async () => {
      const rawBody = JSON.stringify({ event: 'payment.success', amount: 100 });
      const req = new NextRequest('http://localhost:3000/api/webhooks/payment/nmi', {
        method: 'POST',
        headers: {
          'x-nmi-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        },
        body: rawBody,
      });

      const res = await POST(req, { params: { provider: 'nmi' } });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toBe('Invalid webhook cryptographic signature');
    });
  });

  describe('Raw Request Body Preservation (Step 126.2)', () => {
    it('preserves exact raw byte payload without mutation or formatting corruption', async () => {
      const exactRawBody = '{"event":"payout.paid","timestamp":1700000000,"amount":450.00}';
      const signature = createHmacSignature(exactRawBody);

      const req = new NextRequest('http://localhost:3000/api/webhooks/payment/payoneer', {
        method: 'POST',
        headers: {
          'payoneer-signature': signature,
        },
        body: exactRawBody,
      });

      const res = await POST(req, { params: { provider: 'payoneer' } });
      expect(res.status).toBe(202);

      const events = getEnqueuedWebhookEvents('payoneer');
      expect(events.length).toBe(1);
      expect(events[0]?.rawBody).toBe(exactRawBody);
    });
  });

  describe('Multi-Provider Webhook Ingestion Routes', () => {
    it('ingests and verifies valid NMI webhooks', async () => {
      const rawBody = JSON.stringify({ event_type: 'transaction.sale.success', transaction_id: 'nmi_tx_123' });
      const signature = createHmacSignature(rawBody);

      const req = new NextRequest('http://localhost:3000/api/webhooks/payment/nmi', {
        method: 'POST',
        headers: {
          'nmi-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req, { params: { provider: 'nmi' } });
      expect(res.status).toBe(202);

      const json = await res.json();
      expect(json.received).toBe(true);
      expect(json.provider).toBe('nmi');
    });

    it('ingests and verifies valid Rainforest webhooks', async () => {
      const rawBody = JSON.stringify({ event_type: 'merchant.approved', merchant_id: 'rf_m_999' });
      const signature = createHmacSignature(rawBody);

      const req = new NextRequest('http://localhost:3000/api/webhooks/payment/rainforest', {
        method: 'POST',
        headers: {
          'rainforest-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req, { params: { provider: 'rainforest' } });
      expect(res.status).toBe(202);

      const json = await res.json();
      expect(json.received).toBe(true);
      expect(json.provider).toBe('rainforest');
    });

    it('ingests and verifies valid Airwallex webhooks', async () => {
      const rawBody = JSON.stringify({ name: 'payment_intent.succeeded', id: 'awx_evt_555' });
      const signature = createHmacSignature(rawBody);

      const req = new NextRequest('http://localhost:3000/api/webhooks/payment/airwallex', {
        method: 'POST',
        headers: {
          'x-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req, { params: { provider: 'airwallex' } });
      expect(res.status).toBe(202);

      const json = await res.json();
      expect(json.received).toBe(true);
      expect(json.provider).toBe('airwallex');
    });
  });

  describe('Asynchronous Background Dispatching (Step 126.3 & 126.4)', () => {
    it('dispatches verified event to registered background handler', async () => {
      const receivedEvents: WebhookEventEnvelope[] = [];
      const unregister = registerWebhookHandler('nmi', '*', async (evt) => {
        receivedEvents.push(evt);
      });

      const rawBody = JSON.stringify({ event_type: 'refund.issued', refund_id: 'ref_987' });
      const signature = createHmacSignature(rawBody);

      const req = new NextRequest('http://localhost:3000/api/webhooks/payment/nmi', {
        method: 'POST',
        headers: {
          'x-nmi-signature': signature,
        },
        body: rawBody,
      });

      const res = await POST(req, { params: { provider: 'nmi' } });
      expect(res.status).toBe(202);

      // Verify event was captured by registered handler
      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0]?.provider).toBe('nmi');
      expect(receivedEvents[0]?.status).toBe('completed');

      unregister();
    });
  });
});
