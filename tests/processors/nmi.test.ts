// path: tests/processors/nmi.test.ts

import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { NmiAdapter, parseNmiQueryResponse, DEFAULT_NMI_ENDPOINT } from '@/lib/processors/nmi';
import { Money } from '@/lib/money/money';
import {
  GatewayAuthError,
  GatewayDeclinedError,
  GatewayInvalidRequestError,
} from '@/lib/processors/types';

describe('Step 113: NMI Official Adapter with Collect.js Token Exchange', () => {
  const dummySecurityKey = 'sec_nmi_test_key_8829104712049';

  describe('Step 113.1: Adapter Initialization & Configuration', () => {
    it('initializes correctly with valid security key and defaults to standard endpoint', () => {
      const adapter = new NmiAdapter({ securityKey: dummySecurityKey });
      expect(adapter.providerSlug).toBe('nmi');
      expect(adapter.providerDisplayName).toContain('NMI');
    });

    it('throws GatewayAuthError when security key is empty', () => {
      expect(() => new NmiAdapter({ securityKey: '   ' })).toThrow(GatewayAuthError);
    });
  });

  describe('Step 113.2: Direct Post Response Parsing', () => {
    it('parses standard approved response query string', () => {
      const queryString =
        'response=1&responsetext=SUCCESS&authcode=123456&transactionid=678901234&avsresponse=Y&cvvresponse=M&orderid=ORD-991&type=auth&response_code=100';
      const parsed = parseNmiQueryResponse(queryString);

      expect(parsed.response).toBe('1');
      expect(parsed.responsetext).toBe('SUCCESS');
      expect(parsed.authcode).toBe('123456');
      expect(parsed.transactionid).toBe('678901234');
      expect(parsed.avsresponse).toBe('Y');
      expect(parsed.cvvresponse).toBe('M');
      expect(parsed.response_code).toBe('100');
    });

    it('parses declined response correctly', () => {
      const queryString =
        'response=2&responsetext=DECLINE&transactionid=678901235&response_code=200&avsresponse=N&cvvresponse=N';
      const parsed = parseNmiQueryResponse(queryString);

      expect(parsed.response).toBe('2');
      expect(parsed.responsetext).toBe('DECLINE');
      expect(parsed.response_code).toBe('200');
    });
  });

  describe('Step 113.3: Collect.js Token Exchange & Authorization', () => {
    it('successfully authorizes payment exchanging Collect.js payment token (response=1)', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          'response=1&responsetext=APPROVED&authcode=AUTH771&transactionid=tx_nmi_99182&avsresponse=Y&cvvresponse=M&response_code=100',
      });

      const adapter = new NmiAdapter({
        securityKey: dummySecurityKey,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const result = await adapter.authorizePayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        amount: Money.from(150.25),
        currency: 'USD',
        paymentMethodToken: 'collect_tok_card_visa_4242',
        idempotencyKey: 'idem_nmi_001',
        customerEmail: 'buyer@example.com',
      });

      expect(mockHttpClient).toHaveBeenCalledTimes(1);
      const callArgs = mockHttpClient.mock.calls[0];
      expect(callArgs[0]).toBe(DEFAULT_NMI_ENDPOINT);

      const requestBody = new URLSearchParams(callArgs[1].body);
      expect(requestBody.get('payment_token')).toBe('collect_tok_card_visa_4242');
      expect(requestBody.get('type')).toBe('auth');
      expect(requestBody.get('amount')).toBe('150.25');
      expect(requestBody.get('security_key')).toBe(dummySecurityKey);

      expect(result.success).toBe(true);
      expect(result.status).toBe('authorized');
      expect(result.transactionId).toBe('tx_nmi_99182');
      expect(result.authorizationCode).toBe('AUTH771');
      expect(result.avsResultCode).toBe('Y');
      expect(result.cvvResultCode).toBe('M');
    });

    it('throws GatewayDeclinedError when NMI returns response=2', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          'response=2&responsetext=DECLINED+INSUFFICIENT+FUNDS&transactionid=tx_nmi_99183&response_code=204',
      });

      const adapter = new NmiAdapter({
        securityKey: dummySecurityKey,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      await expect(
        adapter.authorizePayment({
          companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
          amount: Money.from(50.0),
          currency: 'USD',
          paymentMethodToken: 'collect_tok_card_insufficient',
          idempotencyKey: 'idem_nmi_002',
        })
      ).rejects.toThrow(GatewayDeclinedError);
    });

    it('throws GatewayInvalidRequestError if payment token is missing', async () => {
      const adapter = new NmiAdapter({ securityKey: dummySecurityKey });
      await expect(
        adapter.authorizePayment({
          companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
          amount: Money.from(50.0),
          currency: 'USD',
          paymentMethodToken: '',
          idempotencyKey: 'idem_nmi_003',
        })
      ).rejects.toThrow(GatewayInvalidRequestError);
    });
  });

  describe('Step 113.4: Payment Capture & Refund Execution', () => {
    it('captures previously authorized transaction', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          'response=1&responsetext=APPROVED&authcode=CAPT992&transactionid=tx_nmi_99182&response_code=100',
      });

      const adapter = new NmiAdapter({
        securityKey: dummySecurityKey,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const result = await adapter.capturePayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        authorizationTransactionId: 'tx_nmi_99182',
        amount: Money.from(150.25),
        idempotencyKey: 'idem_nmi_capt_01',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('captured');
      expect(result.transactionId).toBe('tx_nmi_99182');
    });

    it('refunds captured transaction successfully', async () => {
      const mockHttpClient = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          'response=1&responsetext=APPROVED&transactionid=ref_nmi_11029&response_code=100',
      });

      const adapter = new NmiAdapter({
        securityKey: dummySecurityKey,
        httpClient: mockHttpClient as unknown as typeof fetch,
      });

      const result = await adapter.refundPayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        originalTransactionId: 'tx_nmi_99182',
        amount: Money.from(50.0),
        idempotencyKey: 'idem_nmi_ref_01',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('succeeded');
      expect(result.refundId).toBe('ref_nmi_11029');
    });

    it('throws error when payout is attempted on NMI (unsupported rail)', async () => {
      const adapter = new NmiAdapter({ securityKey: dummySecurityKey });
      await expect(
        adapter.createPayout({
          companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
          amount: Money.from(100.0),
          destinationBankAccountId: 'bank_001',
          currency: 'USD',
          idempotencyKey: 'idem_po_01',
        })
      ).rejects.toThrow(GatewayInvalidRequestError);
    });
  });

  describe('Step 113.5: Webhook Verification', () => {
    it('verifies valid HMAC-SHA256 signature on NMI webhook event', async () => {
      const adapter = new NmiAdapter({ securityKey: dummySecurityKey });
      const webhookSecret = 'nmi_whsec_secret_448918291047120498';
      const payload = JSON.stringify({
        event_type: 'charge.settled',
        transaction_id: 'tx_nmi_99182',
        amount: '150.25',
      });

      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      const result = await adapter.verifyWebhook(payload, validSignature, webhookSecret);
      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('charge.settled');
      expect(result.providerEventId).toBe('tx_nmi_99182');
    });

    it('rejects tampered webhook signature', async () => {
      const adapter = new NmiAdapter({ securityKey: dummySecurityKey });
      const webhookSecret = 'nmi_whsec_secret_448918291047120498';
      const payload = JSON.stringify({ event_type: 'charge.settled' });

      const invalidSignature = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const result = await adapter.verifyWebhook(payload, invalidSignature, webhookSecret);

      expect(result.isValid).toBe(false);
      expect(result.failureReason).toContain('failed');
    });
  });
});
