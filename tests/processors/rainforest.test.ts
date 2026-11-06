// path: tests/processors/rainforest.test.ts

import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { RainforestAdapter } from '@/lib/processors/rainforest';
import { Money } from '@/lib/money/money';
import {
  GatewayAuthError,
  GatewayDeclinedError,
  GatewayInvalidRequestError,
} from '@/lib/processors/types';

describe('Step 116: Rainforest Payment Acceptance & Sub-Merchant Creation Adapter', () => {
  const dummyConfig = {
    apiKey: 'rf_key_test_sandbox_88192038104',
    baseUrl: 'https://api.sandbox.rainforestpay.com/v1',
  };

  describe('Step 116.1: Adapter Initialization & Configuration', () => {
    it('initializes Rainforest adapter with valid key', () => {
      const adapter = new RainforestAdapter(dummyConfig);
      expect(adapter.providerSlug).toBe('rainforest');
      expect(adapter.providerDisplayName).toBe('Rainforest Pay');
    });

    it('throws GatewayAuthError when API key is missing', () => {
      expect(() => new RainforestAdapter({ apiKey: '   ' })).toThrow(GatewayAuthError);
    });
  });

  describe('Step 116.2: Sub-Merchant Onboarding Creation', () => {
    it('creates sub-merchant entity on Rainforest sandbox', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          merchant_id: 'rf_mer_sand_991823',
          status: 'active',
        }),
      });

      const adapter = new RainforestAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const result = await adapter.createSubMerchant({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        legalBusinessName: 'Rainforest Merchant Store LLC',
        dbaName: 'Rainforest Store',
        mccCode: '5732',
        taxId: '12-3456789',
        representativeEmail: 'owner@rfstore.com',
        countryCode: 'US',
      });

      expect(result.success).toBe(true);
      expect(result.providerSubmerchantId).toBe('rf_mer_sand_991823');
      expect(result.status).toBe('active');
      expect(result.capabilities.card_payments).toBe(true);
      expect(result.capabilities.payouts).toBe(true);
    });
  });

  describe('Step 116.3: Card Payment Authorization & Capture', () => {
    it('authorizes card payin using payment_method token', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          payin_id: 'rf_payin_live_8829104',
          status: 'authorized',
        }),
      });

      const adapter = new RainforestAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const charge = await adapter.authorizePayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        submerchantId: 'rf_mer_sand_991823',
        amount: Money.from(120.5),
        currency: 'USD',
        paymentMethodToken: 'pm_rf_card_tok_998124',
        idempotencyKey: 'rf_idem_payin_01',
      });

      expect(charge.success).toBe(true);
      expect(charge.status).toBe('authorized');
      expect(charge.transactionId).toBe('rf_payin_live_8829104');
      expect(charge.amount.toDisplayString()).toBe('$120.50');
    });

    it('throws GatewayDeclinedError when card payin is declined', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        text: async () => 'card_declined_insufficient_funds',
      });

      const adapter = new RainforestAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      await expect(
        adapter.authorizePayment({
          companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
          amount: Money.from(50.0),
          currency: 'USD',
          paymentMethodToken: 'pm_rf_card_declined',
          idempotencyKey: 'rf_idem_declined_01',
        })
      ).rejects.toThrow(GatewayDeclinedError);
    });

    it('captures authorized Rainforest payin', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'succeeded' }),
      });

      const adapter = new RainforestAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const capture = await adapter.capturePayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        authorizationTransactionId: 'rf_payin_live_8829104',
        amount: Money.from(120.5),
        idempotencyKey: 'rf_idem_capt_01',
      });

      expect(capture.success).toBe(true);
      expect(capture.status).toBe('captured');
      expect(capture.transactionId).toBe('rf_payin_live_8829104');
    });
  });

  describe('Step 116.4: Webhook Signature Verification', () => {
    it('verifies valid HMAC-SHA256 signature from Rainforest webhook', async () => {
      const adapter = new RainforestAdapter(dummyConfig);
      const webhookSecret = 'rf_whsec_secret_key_8819204';
      const eventPayload = JSON.stringify({
        type: 'merchant.approved',
        merchant_id: 'rf_mer_sand_991823',
        status: 'active',
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(eventPayload, 'utf8')
        .digest('hex');

      const verification = await adapter.verifyWebhook(eventPayload, signature, webhookSecret);
      expect(verification.isValid).toBe(true);
      expect(verification.eventType).toBe('merchant.approved');
    });

    it('rejects tampered Rainforest webhook signature', async () => {
      const adapter = new RainforestAdapter(dummyConfig);
      const webhookSecret = 'rf_whsec_secret_key_8819204';
      const eventPayload = JSON.stringify({ type: 'payin.succeeded' });

      const invalidSig = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const verification = await adapter.verifyWebhook(eventPayload, invalidSig, webhookSecret);
      expect(verification.isValid).toBe(false);
      expect(verification.failureReason).toContain('mismatch');
    });
  });
});
