// path: tests/processors/payoneer.test.ts

import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { PayoneerAdapter } from '@/lib/processors/payoneer';
import { Money } from '@/lib/money/money';
import { GatewayAuthError, GatewayInvalidRequestError } from '@/lib/processors/types';

describe('Step 115: Payoneer Global Payout Adapter Implementation', () => {
  const dummyConfig = {
    programId: 'prog_payo_test_100',
    clientId: 'client_payo_id_test',
    clientSecret: 'sec_payo_secret_test_99281',
    baseUrl: 'https://api.sandbox.payoneer.com/v4',
  };

  describe('Step 115.1: Adapter Initialization & OAuth Token Acquisition', () => {
    it('initializes with valid credentials and sets provider identifiers', () => {
      const adapter = new PayoneerAdapter(dummyConfig);
      expect(adapter.providerSlug).toBe('payoneer');
      expect(adapter.providerDisplayName).toBe('Payoneer Mass Payouts');
    });

    it('throws GatewayAuthError when configuration credentials are missing', () => {
      expect(
        () =>
          new PayoneerAdapter({
            programId: '',
            clientId: '',
            clientSecret: '',
          })
      ).toThrow(GatewayAuthError);
    });

    it('authenticates via OAuth2 client_credentials and caches access token', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'payo_bearer_tok_9918237',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const adapter = new PayoneerAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const token1 = await adapter.getAccessToken();
      expect(token1).toBe('payo_bearer_tok_9918237');

      // Subsequent call uses cached token within TTL
      const token2 = await adapter.getAccessToken();
      expect(token2).toBe('payo_bearer_tok_9918237');
      expect(mockHttpClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('Step 115.2: Merchant Bank Account Registration', () => {
    it('registers payee bank account via Payoneer Mass Payouts API', async () => {
      const mockHttpClient = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.includes('/oauth2/token')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ access_token: 'tok_active_01', expires_in: 3600 }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              bank_account_id: 'ba_payo_998124',
              status: 'active',
            }),
          };
        });

      const adapter = new PayoneerAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const result = await adapter.registerPayoutBank('01a1aa91-3500-7fa1-b1e2-123456789abc', {
        bankName: 'JPMorgan Chase Bank, N.A.',
        accountNumber: '123456789012',
        routingNumber: '021000021',
        accountHolderName: 'Apex Commerce Solutions LLC',
        countryCode: 'US',
        currency: 'USD',
      });

      expect(result.payeeId).toContain('payee_01a1aa9135007fa');
      expect(result.bankAccountId).toBe('ba_payo_998124');
      expect(result.status).toBe('active');
    });
  });

  describe('Step 115.3: Disbursing Settlement Payouts', () => {
    it('disburses approved settlement payout in USD', async () => {
      const mockHttpClient = vi
        .fn()
        .mockImplementation(async (url: string) => {
          if (url.includes('/oauth2/token')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ access_token: 'tok_active_01', expires_in: 3600 }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              payout_id: 'po_payo_live_881920',
              status: 'COMPLETED',
            }),
          };
        });

      const adapter = new PayoneerAdapter({
        ...dummyConfig,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const payout = await adapter.createPayout({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        amount: Money.from(2500.0),
        destinationBankAccountId: 'ba_payo_998124',
        currency: 'USD',
        idempotencyKey: 'idem_po_8812',
        description: 'Settlement Batch 8812',
      });

      expect(payout.success).toBe(true);
      expect(payout.payoutId).toBe('po_payo_live_881920');
      expect(payout.status).toBe('paid');
      expect(payout.amount.toDisplayString()).toBe('$2,500.00');
    });

    it('rejects card payment authorization on Payoneer adapter (mass payout only)', async () => {
      const adapter = new PayoneerAdapter(dummyConfig);
      await expect(
        adapter.authorizePayment({
          companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
          amount: Money.from(100.0),
          currency: 'USD',
          paymentMethodToken: 'tok_test',
          idempotencyKey: 'idem_01',
        })
      ).rejects.toThrow(GatewayInvalidRequestError);
    });
  });

  describe('Step 115.4: Webhook Signature Verification', () => {
    it('cryptographically verifies Payoneer HMAC-SHA256 signature', async () => {
      const adapter = new PayoneerAdapter(dummyConfig);
      const webhookSecret = 'whsec_payo_test_key_884920';
      const eventPayload = JSON.stringify({
        event_type: 'payout.completed',
        payout_id: 'po_payo_live_881920',
        client_reference_id: 'idem_po_8812',
        amount: '2500.00',
        currency: 'USD',
        status: 'COMPLETED',
        timestamp: '2026-11-05T07:20:00Z',
      });

      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(eventPayload, 'utf8')
        .digest('hex');

      const verification = await adapter.verifyWebhook(
        eventPayload,
        validSignature,
        webhookSecret
      );

      expect(verification.isValid).toBe(true);
      expect(verification.eventType).toBe('payout.completed');
      expect(verification.providerEventId).toBe('po_payo_live_881920');
    });

    it('rejects tampered Payoneer webhook signature', async () => {
      const adapter = new PayoneerAdapter(dummyConfig);
      const webhookSecret = 'whsec_payo_test_key_884920';
      const eventPayload = JSON.stringify({
        event_type: 'payout.completed',
        payout_id: 'po_payo_live_881920',
      });

      const invalidSig = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const verification = await adapter.verifyWebhook(eventPayload, invalidSig, webhookSecret);

      expect(verification.isValid).toBe(false);
      expect(verification.failureReason).toContain('mismatch');
    });
  });
});
