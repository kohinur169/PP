// path: tests/api/public-api-and-sandbox.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createMerchantApiKey,
  resetApiKeyStore,
} from '@/lib/api/api-keys';
import {
  authenticateApiRequest,
} from '@/lib/api/auth';
import {
  POST as postCheckoutSession,
  resetCheckoutSessionsStore,
} from '@/app/api/v1/checkout/sessions/route';
import {
  setMerchantSandboxMode,
  getMerchantSandboxContext,
  assertSandboxTransactionAllowed,
  resetSandboxModes,
} from '@/lib/sandbox/context';
import {
  simulateWebhookDispatch,
  generateWebhookSignature,
} from '@/lib/sandbox/simulate-webhook';
import {
  resolveShopifyPaymentSession,
} from '@/lib/shopify/payments';

describe('Phase 15: Public API, Developer Sandbox & E-commerce Plugins (Steps 211-220)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';
  const createdBy = 'usr_owner_01';

  beforeEach(() => {
    resetApiKeyStore();
    resetCheckoutSessionsStore();
    resetSandboxModes();
  });

  describe('Step 211 & Step 212: API Keys, Bearer Auth & Masked Secret Verification', () => {
    it('generates publishable/secret key pair and masks secret string', async () => {
      const { record, plaintextSecretKey } = await createMerchantApiKey({
        tenantId,
        companyId,
        name: 'Production Store Key',
        environment: 'live',
        createdBy,
      });

      expect(plaintextSecretKey).toMatch(/^sk_live_[a-f0-9]{48}$/);
      expect(record.publishableKey).toMatch(/^pk_live_[a-f0-9]{32}$/);
      expect(record.maskedSecretKey).toContain('••••••••••••');
      expect(record.maskedSecretKey.slice(-4)).toBe(plaintextSecretKey.slice(-4));
    });

    it('authenticates valid Bearer token and rejects invalid token with 401', async () => {
      const { plaintextSecretKey } = await createMerchantApiKey({
        tenantId,
        companyId,
        environment: 'live',
        createdBy,
      });

      // Valid request
      const validReq = new Request('https://api.kdsolution.it/v1/test', {
        headers: { Authorization: `Bearer ${plaintextSecretKey}` },
      });
      const context = await authenticateApiRequest(validReq);
      expect(context.companyId).toBe(companyId);
      expect(context.environment).toBe('live');

      // Invalid request
      const invalidReq = new Request('https://api.kdsolution.it/v1/test', {
        headers: { Authorization: 'Bearer sk_live_invalid_bad_token_00000000000' },
      });
      await expect(authenticateApiRequest(invalidReq)).rejects.toThrow(
        /Provided API key is invalid, revoked, or expired/
      );
    });
  });

  describe('Step 213: Store Payment Intent & Checkout Session API', () => {
    it('creates hosted checkout session via POST /v1/checkout/sessions', async () => {
      const { plaintextSecretKey } = await createMerchantApiKey({
        tenantId,
        companyId,
        environment: 'live',
        createdBy,
      });

      const body = {
        orderId: 'ORDER_WOO_8888',
        amountUsd: '149.9900',
        currency: 'USD',
        customerEmail: 'customer@clientstore.test',
        returnUrl: 'https://store.client.test/checkout/success',
        cancelUrl: 'https://store.client.test/checkout/cancel',
      };

      const req = new NextRequest('https://api.kdsolution.it/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${plaintextSecretKey}`,
        },
        body: JSON.stringify(body),
      });

      const res = await postCheckoutSession(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.session_id).toMatch(/^cs_[a-f0-9]+/);
      expect(json.checkout_url).toContain('/pay/cs_');
      expect(json.amount).toBe('149.9900');
    });
  });

  describe('Step 214: Developer Sandbox & Test Mode Isolation', () => {
    it('toggles test mode and prevents test payments from bank payouts', () => {
      const liveContext = getMerchantSandboxContext(companyId);
      expect(liveContext.isTestMode).toBe(false);

      const testContext = setMerchantSandboxMode(companyId, true);
      expect(testContext.isTestMode).toBe(true);
      expect(testContext.bannerVisible).toBe(true);
      expect(testContext.bannerMessage).toContain('TEST MODE ACTIVE');

      expect(() => assertSandboxTransactionAllowed(true, 'payout')).toThrow(
        /Payouts to real bank accounts are strictly prohibited in Test Mode/
      );
      expect(() => assertSandboxTransactionAllowed(true, 'charge')).not.toThrow();
    });
  });

  describe('Step 215: Simulated Webhooks Dispatcher with HMAC Signature', () => {
    it('dispatches simulated webhook with valid HMAC-SHA256 signature header', async () => {
      const secret = 'whsec_test_secret_998877';
      const result = await simulateWebhookDispatch({
        companyId,
        destinationUrl: 'https://merchant.test/webhook',
        webhookSecret: secret,
        eventType: 'payment.succeeded',
      });

      expect(result.eventType).toBe('payment.succeeded');
      expect(result.signatureHeader).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
      expect(result.simulatedHttpStatus).toBe(200);

      // Verify HMAC matches
      const timestampMatch = result.signatureHeader.match(/t=(\d+)/);
      const timestamp = Number(timestampMatch![1]);
      const expectedHeader = generateWebhookSignature(JSON.stringify(result.payload), secret, timestamp);
      expect(result.signatureHeader).toBe(expectedHeader);
    });
  });

  describe('Step 216 & Step 217: Shopify Payments Resolution', () => {
    it('resolves Shopify payments app session via GraphQL mutation', async () => {
      const resolution = await resolveShopifyPaymentSession({
        paymentSessionId: 'sh_sess_018f6c4c',
        shopifyOrderGid: 'gid://shopify/Order/89891212',
        companyId,
        chargeId: 'ch_test_shopify_001',
        amountUsd: '299.0000',
      });

      expect(resolution.status).toBe('resolved');
      expect(resolution.graphqlResponseStatus).toBe(200);
      expect(resolution.orderId).toBe('gid://shopify/Order/89891212');
    });
  });
});
