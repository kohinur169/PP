// path: tests/webhooks/signatures.test.ts

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyStripeWebhook } from '@/lib/webhooks/signatures/stripe';
import { verifyNmiWebhook } from '@/lib/webhooks/signatures/nmi';
import { verifyRainforestWebhook } from '@/lib/webhooks/signatures/rainforest';
import { verifyAirwallexWebhook } from '@/lib/webhooks/signatures/airwallex';
import { verifyPayoneerWebhook } from '@/lib/webhooks/signatures/payoneer';

describe('Processor-Specific Webhook Signature Verification Modules (Step 127)', () => {
  const secretKey = 'whsec_test_mock_secret_key_889102';

  describe('Stripe Webhook Signature Verifier (Step 127.1)', () => {
    const rawPayload = JSON.stringify({
      id: 'evt_stripe_test_123',
      type: 'payment_intent.succeeded',
      amount: 5000,
    });

    function makeStripeHeader(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
      const sig = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`, 'utf8')
        .digest('hex');
      return `t=${timestamp},v1=${sig}`;
    }

    it('verifies valid Stripe webhook signature and extracts event metadata', async () => {
      const header = makeStripeHeader(rawPayload, secretKey);
      const result = await verifyStripeWebhook(rawPayload, header, secretKey);

      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('payment_intent.succeeded');
      expect(result.providerEventId).toBe('evt_stripe_test_123');
    });

    it('rejects Stripe webhook when payload byte is tampered with', async () => {
      const header = makeStripeHeader(rawPayload, secretKey);
      const tamperedPayload = rawPayload.replace('5000', '9999');

      const result = await verifyStripeWebhook(tamperedPayload, header, secretKey);
      expect(result.isValid).toBe(false);
      expect(result.failureReason).toContain('No signatures matched');
    });

    it('rejects Stripe webhook with expired timestamp exceeding 300-second replay tolerance', async () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const header = makeStripeHeader(rawPayload, secretKey, expiredTimestamp);

      const result = await verifyStripeWebhook(rawPayload, header, secretKey, 300);
      expect(result.isValid).toBe(false);
      expect(result.failureReason).toContain('Timestamp outside the tolerance zone');
    });

    it('rejects malformed or empty signature headers', async () => {
      const result = await verifyStripeWebhook(rawPayload, 'invalid-header-without-equal', secretKey);
      expect(result.isValid).toBe(false);
      expect(result.failureReason).toContain('Malformed Stripe-Signature header');
    });
  });

  describe('NMI Webhook Signature Verifier (Step 127.2)', () => {
    const rawPayload = JSON.stringify({
      event_type: 'transaction.sale.success',
      transaction_id: 'nmi_tx_777888',
      amount: '120.00',
    });

    function makeHmac(payload: string, secret: string): string {
      return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    }

    it('verifies valid NMI HMAC-SHA256 signature', async () => {
      const sig = makeHmac(rawPayload, secretKey);
      const result = await verifyNmiWebhook(rawPayload, sig, secretKey);

      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('transaction.sale.success');
      expect(result.providerEventId).toBe('nmi_tx_777888');
    });

    it('rejects NMI webhook when payload is altered', async () => {
      const sig = makeHmac(rawPayload, secretKey);
      const alteredPayload = rawPayload.replace('120.00', '120.01');

      const result = await verifyNmiWebhook(alteredPayload, sig, secretKey);
      expect(result.isValid).toBe(false);
      expect(result.failureReason).toBe('NMI signature verification failed.');
    });

    it('rejects when signature header is missing or empty', async () => {
      const result = await verifyNmiWebhook(rawPayload, '', secretKey);
      expect(result.isValid).toBe(false);
      expect(result.failureReason).toContain('Missing NMI webhook signature');
    });
  });

  describe('Rainforest Webhook Signature Verifier (Step 127.3)', () => {
    const rawPayload = JSON.stringify({
      event_type: 'merchant.provisioned',
      event_id: 'rf_evt_9911',
      status: 'active',
    });

    it('verifies valid Rainforest HMAC-SHA256 signature', async () => {
      const sig = crypto.createHmac('sha256', secretKey).update(rawPayload, 'utf8').digest('hex');
      const result = await verifyRainforestWebhook(rawPayload, sig, secretKey);

      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('merchant.provisioned');
      expect(result.providerEventId).toBe('rf_evt_9911');
    });

    it('rejects Rainforest webhook when signature does not match', async () => {
      const result = await verifyRainforestWebhook(rawPayload, '00112233445566778899aabbccddeeff', secretKey);
      expect(result.isValid).toBe(false);
      expect(result.failureReason).toBe('Rainforest signature verification failed.');
    });
  });

  describe('Airwallex Webhook Signature Verifier (Step 127.3)', () => {
    const rawPayload = JSON.stringify({
      name: 'payment_dispute.created',
      id: 'awx_dispute_01',
    });

    it('verifies valid Airwallex signature with timestamp header', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const sig = crypto.createHmac('sha256', secretKey).update(`${timestamp}${rawPayload}`, 'utf8').digest('hex');

      const result = await verifyAirwallexWebhook(rawPayload, sig, secretKey, {
        timestampHeader: timestamp,
      });

      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('payment_dispute.created');
      expect(result.providerEventId).toBe('awx_dispute_01');
    });

    it('rejects Airwallex webhook when timestamp header is expired', async () => {
      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 500).toString();
      const sig = crypto.createHmac('sha256', secretKey).update(`${expiredTimestamp}${rawPayload}`, 'utf8').digest('hex');

      const result = await verifyAirwallexWebhook(rawPayload, sig, secretKey, {
        timestampHeader: expiredTimestamp,
        toleranceSeconds: 300,
      });

      expect(result.isValid).toBe(false);
      expect(result.failureReason).toContain('timestamp outside tolerance window');
    });
  });

  describe('Payoneer Webhook Signature Verifier (Step 127.3)', () => {
    const rawPayload = JSON.stringify({
      event_type: 'payout.completed',
      payout_id: 'pdr_pay_8849',
      status: 'paid',
    });

    it('verifies valid Payoneer HMAC-SHA256 signature', async () => {
      const sig = crypto.createHmac('sha256', secretKey).update(rawPayload, 'utf8').digest('hex');
      const result = await verifyPayoneerWebhook(rawPayload, sig, secretKey);

      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('payout.completed');
      expect(result.providerEventId).toBe('pdr_pay_8849');
    });

    it('supports Bearer verification token fallback', async () => {
      const result = await verifyPayoneerWebhook(rawPayload, `Bearer ${secretKey}`, secretKey);
      expect(result.isValid).toBe(true);
    });

    it('rejects invalid Payoneer signature', async () => {
      const result = await verifyPayoneerWebhook(rawPayload, 'invalid_token_123', secretKey);
      expect(result.isValid).toBe(false);
      expect(result.failureReason).toBe('Payoneer webhook signature verification failed.');
    });
  });
});
