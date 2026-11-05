// path: tests/api/store-payments.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/lib/money/money';
import {
  createMerchantApiKey,
  resetApiKeyStore,
} from '@/lib/api/api-keys';
import {
  createStorePaymentIntent,
  getStorePaymentIntent,
  checkStoreApiRateLimit,
  resetStorePaymentsState,
  StoreApiRateLimitExceededError,
} from '@/lib/api/store-payments';

describe('Public Store Payment Intent API, Rate Limiter & Audit Middleware (Step 146)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyA = '22222222-2222-4222-8222-222222222222';
  const companyB = '33333333-3333-4333-8333-333333333333';
  const merchantStaff = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    resetApiKeyStore();
    resetStorePaymentsState();
  });

  describe('Payment Intent Creation (Step 146.1)', () => {
    it('creates online store payment intent with client secret and initial status requires_payment_method', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId: companyA,
        createdBy: merchantStaff,
      });

      const { intent, rateLimit } = await createStorePaymentIntent({
        apiKey: keyGen.plaintextSecretKey,
        orderId: 'ORD-SHOPIFY-10023',
        amount: Money.from('149.9900'),
        currency: 'USD',
        customerEmail: 'shopper@example.com',
        metadata: { store: 'shopify', cartItems: 3 },
        ipAddress: '198.51.100.22',
      });

      expect(intent.id).toBeDefined();
      expect(intent.status).toBe('requires_payment_method');
      expect(intent.amount.toNumericString()).toBe('149.9900');
      expect(intent.currency).toBe('USD');
      expect(intent.clientSecret).toMatch(/^pi_sec_/);
      expect(rateLimit.allowed).toBe(true);
      expect(rateLimit.remaining).toBeLessThan(60);

      // Verify retrieval
      const fetched = await getStorePaymentIntent(intent.id, keyGen.plaintextSecretKey);
      expect(fetched.id).toBe(intent.id);
      expect(fetched.orderId).toBe('ORD-SHOPIFY-10023');
    });

    it('strictly rejects non-USD currency or zero amount', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId: companyA,
        createdBy: merchantStaff,
      });

      await expect(
        createStorePaymentIntent({
          apiKey: keyGen.plaintextSecretKey,
          orderId: 'ORD-INVALID-CURR',
          amount: Money.from('50.0000'),
          currency: 'EUR' as 'USD',
        })
      ).rejects.toThrow(/Platform strictly settles and processes online store payments in USD/);

      await expect(
        createStorePaymentIntent({
          apiKey: keyGen.plaintextSecretKey,
          orderId: 'ORD-ZERO',
          amount: Money.from('0.0000'),
          currency: 'USD',
        })
      ).rejects.toThrow(/strictly greater than zero/);
    });
  });

  describe('Per-Merchant Sliding Window Rate Limiter (Step 146.2)', () => {
    it('tracks attempts and enforces 429 rate limit when company requests exceed threshold', async () => {
      const testLimit = 3;
      const now = Date.now();

      // First 3 requests succeed
      expect(checkStoreApiRateLimit(companyA, now, testLimit).allowed).toBe(true);
      expect(checkStoreApiRateLimit(companyA, now + 100, testLimit).allowed).toBe(true);
      expect(checkStoreApiRateLimit(companyA, now + 200, testLimit).allowed).toBe(true);

      // 4th request exceeds rate limit
      const blocked = checkStoreApiRateLimit(companyA, now + 300, testLimit);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetSeconds).toBeGreaterThan(0);
    });

    it('throws StoreApiRateLimitExceededError with retryAfterSeconds on rate limit breach', async () => {
      const keyGen = await createMerchantApiKey({
        tenantId,
        companyId: companyA,
        createdBy: merchantStaff,
      });

      // Exhaust limit of 60 requests
      for (let i = 0; i < 60; i++) {
        checkStoreApiRateLimit(companyA);
      }

      await expect(
        createStorePaymentIntent({
          apiKey: keyGen.plaintextSecretKey,
          orderId: 'ORD-RATE-LIMIT-BREACH',
          amount: Money.from('20.0000'),
          currency: 'USD',
        })
      ).rejects.toThrow(StoreApiRateLimitExceededError);
    });
  });

  describe('Merchant Isolation Guard (Step 146.3)', () => {
    it('prevents Merchant B from accessing Payment Intent created by Merchant A', async () => {
      const keyA = await createMerchantApiKey({
        tenantId,
        companyId: companyA,
        createdBy: merchantStaff,
      });

      const keyB = await createMerchantApiKey({
        tenantId,
        companyId: companyB,
        createdBy: merchantStaff,
      });

      const { intent } = await createStorePaymentIntent({
        apiKey: keyA.plaintextSecretKey,
        orderId: 'ORD-COMPANY-A-SECRET',
        amount: Money.from('99.0000'),
        currency: 'USD',
      });

      // Merchant B attempts to fetch Merchant A's intent
      await expect(
        getStorePaymentIntent(intent.id, keyB.plaintextSecretKey)
      ).rejects.toThrow(/was not found/);
    });
  });
});
