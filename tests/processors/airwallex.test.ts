// path: tests/processors/airwallex.test.ts

import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { AirwallexAdapter } from '@/lib/processors/airwallex';
import { Money } from '@/lib/money/money';
import {
  GatewayAuthError,
  GatewayDeclinedError,
  GatewayInvalidRequestError,
} from '@/lib/processors/types';

describe('Step 118: Airwallex Connected Accounts & Payment/Payout Adapter', () => {
  const dummyConfig = {
    clientId: 'awx_client_id_test_998124',
    apiKey: 'awx_api_key_test_88192038104',
    baseUrl: 'https://api-demo.airwallex.com/api/v1',
  };

  describe('Step 118.1: Adapter Initialization & Token Acquisition', () => {
    it('initializes Airwallex adapter with valid client ID and API key', () => {
      const adapter = new AirwallexAdapter(dummyConfig);
      expect(adapter.providerSlug).toBe('airwallex');
      expect(adapter.providerDisplayName).toBe('Airwallex');
    });

    it('throws GatewayAuthError when client credentials are missing', () => {
      expect(() => new AirwallexAdapter({ clientId: '', apiKey: '' })).toThrow(
        GatewayAuthError
      );
    });

    it('acquires and caches authentication bearer token', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'awx_jwt_bearer_token_99182',
          expires_at: new Date(Date.now() + 1800 * 1000).toISOString(),
        }),
      });

      const adapter = new AirwallexAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const token1 = await adapter.getAuthToken();
      expect(token1).toBe('awx_jwt_bearer_token_99182');

      const token2 = await adapter.getAuthToken();
      expect(token2).toBe('awx_jwt_bearer_token_99182');
      expect(mockHttpClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('Step 118.2: Connected Account Creation', () => {
    it('creates Airwallex connected account for sub-merchant', async () => {
      const mockHttpClient = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.includes('/authentication/login')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                token: 'awx_jwt_token',
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'acct_awx_sandbox_99120',
              status: 'active',
            }),
          };
        });

      const adapter = new AirwallexAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const result = await adapter.createSubMerchant({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        legalBusinessName: 'Pacific Rim Trade LLC',
        taxId: '88-1920381',
        mccCode: '5732',
        representativeEmail: 'contact@pacificrim.io',
        countryCode: 'US',
      });

      expect(result.success).toBe(true);
      expect(result.providerSubmerchantId).toBe('acct_awx_sandbox_99120');
      expect(result.status).toBe('active');
      expect(result.capabilities.card_payments).toBe(true);
      expect(result.capabilities.payouts).toBe(true);
    });
  });

  describe('Step 118.3: Payment Authorization & Cross-Border Payout', () => {
    it('authorizes payment via PaymentIntent API', async () => {
      const mockHttpClient = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.includes('/authentication/login')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                token: 'awx_jwt_token',
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'int_awx_prod_881920',
              status: 'REQUIRES_CAPTURE',
              latest_charge: { auth_code: 'AWX_AUTH_882' },
            }),
          };
        });

      const adapter = new AirwallexAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const charge = await adapter.authorizePayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        submerchantId: 'acct_awx_sandbox_99120',
        amount: Money.from(340.0),
        currency: 'USD',
        paymentMethodToken: 'pm_awx_card_tok_991',
        idempotencyKey: 'awx_idem_auth_01',
      });

      expect(charge.success).toBe(true);
      expect(charge.status).toBe('authorized');
      expect(charge.transactionId).toBe('int_awx_prod_881920');
      expect(charge.authorizationCode).toBe('AWX_AUTH_882');
    });

    it('handles card decline error during PaymentIntent authorization', async () => {
      const mockHttpClient = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.includes('/authentication/login')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                token: 'awx_jwt_token',
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
              }),
            };
          }
          return {
            ok: false,
            status: 402,
            text: async () => 'transaction_declined_insufficient_funds',
          };
        });

      const adapter = new AirwallexAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      await expect(
        adapter.authorizePayment({
          companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
          amount: Money.from(50.0),
          currency: 'USD',
          paymentMethodToken: 'pm_awx_declined',
          idempotencyKey: 'awx_idem_declined',
        })
      ).rejects.toThrow(GatewayDeclinedError);
    });

    it('captures authorized Airwallex payment intent', async () => {
      const mockHttpClient = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.includes('/authentication/login')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                token: 'awx_jwt_token',
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'int_awx_prod_881920',
              status: 'SUCCEEDED',
            }),
          };
        });

      const adapter = new AirwallexAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const capture = await adapter.capturePayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        authorizationTransactionId: 'int_awx_prod_881920',
        amount: Money.from(340.0),
        idempotencyKey: 'awx_idem_capt_01',
      });

      expect(capture.success).toBe(true);
      expect(capture.status).toBe('captured');
      expect(capture.transactionId).toBe('int_awx_prod_881920');
    });

    it('dispatches cross-border payout via Airwallex Payouts API', async () => {
      const mockHttpClient = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.includes('/authentication/login')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                token: 'awx_jwt_token',
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'po_awx_88192038',
              status: 'PAID',
            }),
          };
        });

      const adapter = new AirwallexAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const payout = await adapter.createPayout({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        amount: Money.from(1500.0),
        destinationBankAccountId: 'ben_awx_99281',
        currency: 'USD',
        idempotencyKey: 'awx_idem_po_01',
        description: 'Settlement Batch 882',
      });

      expect(payout.success).toBe(true);
      expect(payout.payoutId).toBe('po_awx_88192038');
      expect(payout.status).toBe('paid');
      expect(payout.amount.toDisplayString()).toBe('$1,500.00');
    });
  });

  describe('Step 118.4: Webhook Signature Verification', () => {
    it('verifies valid HMAC-SHA256 signature from Airwallex webhook notification', async () => {
      const adapter = new AirwallexAdapter(dummyConfig);
      const webhookSecret = 'awx_whsec_secret_key_8819204';
      const eventPayload = JSON.stringify({
        name: 'payment_intent.succeeded',
        id: 'evt_awx_99182371',
        data: {
          object: { id: 'int_awx_prod_881920' },
        },
      });

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(eventPayload, 'utf8')
        .digest('hex');

      const verification = await adapter.verifyWebhook(eventPayload, signature, webhookSecret);
      expect(verification.isValid).toBe(true);
      expect(verification.eventType).toBe('payment_intent.succeeded');
      expect(verification.providerEventId).toBe('evt_awx_99182371');
    });

    it('rejects tampered Airwallex webhook signature', async () => {
      const adapter = new AirwallexAdapter(dummyConfig);
      const webhookSecret = 'awx_whsec_secret_key_8819204';
      const eventPayload = JSON.stringify({ name: 'payment_intent.succeeded' });

      const invalidSig = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const verification = await adapter.verifyWebhook(eventPayload, invalidSig, webhookSecret);
      expect(verification.isValid).toBe(false);
      expect(verification.failureReason).toContain('failed');
    });
  });
});
