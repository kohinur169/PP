// path: tests/processors/interface.test.ts

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { Money } from '@/lib/money/money';
import { MockPaymentProcessorAdapter } from '@/lib/processors/mock';
import {
  GatewayDeclinedError,
  GatewayInvalidRequestError,
  GatewayNetworkError,
} from '@/lib/processors/types';

describe('Step 111: Unified Payment Processor Adapter Interface Specification', () => {
  const adapter = new MockPaymentProcessorAdapter();

  it('Step 111.1: fulfills testConnection method and verifies sandbox connectivity', async () => {
    const res = await adapter.testConnection();
    expect(res.isConnected).toBe(true);
    expect(res.environment).toBe('sandbox');
    expect(res.latencyMs).toBeGreaterThan(0);
    expect(res.message).toContain('connection verified');
  });

  it('Step 111.2: creates sub-merchant account with full capabilities', async () => {
    const res = await adapter.createSubMerchant({
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      legalBusinessName: 'Apex Cloud Systems Inc',
      mccCode: '5734',
      taxId: 'XX-XXXXXXX',
      representativeEmail: 'owner@apexcloud.com',
      countryCode: 'US',
    });

    expect(res.success).toBe(true);
    expect(res.providerSubmerchantId).toMatch(/^mock_sub_/);
    expect(res.status).toBe('active');
    expect(res.capabilities.card_payments).toBe(true);
    expect(res.capabilities.payouts).toBe(true);
  });

  it('Step 111.3: executes two-step authorization and capture flow with AVS/CVV codes', async () => {
    // 1. Authorize
    const authRes = await adapter.authorizePayment({
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      amount: new Money('149.9900'),
      currency: 'USD',
      paymentMethodToken: 'tok_valid_visa',
      idempotencyKey: 'idemp_auth_001',
    });

    expect(authRes.success).toBe(true);
    expect(authRes.status).toBe('authorized');
    expect(authRes.amount.toNumericString()).toBe('149.9900');
    expect(authRes.authorizationCode).toBeDefined();
    expect(authRes.avsResultCode).toBe('Y');
    expect(authRes.cvvResultCode).toBe('M');

    // 2. Capture
    const captRes = await adapter.capturePayment({
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      authorizationTransactionId: authRes.transactionId,
      amount: new Money('149.9900'),
      idempotencyKey: 'idemp_capt_001',
    });

    expect(captRes.success).toBe(true);
    expect(captRes.status).toBe('captured');
    expect(captRes.transactionId).toBe(authRes.transactionId);
  });

  it('Step 111.4: executes refund and payout operations with USD Money precision', async () => {
    // Refund
    const refundRes = await adapter.refundPayment({
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      originalTransactionId: 'tx_mock_orig_123',
      amount: new Money('49.9900'),
      reason: 'customer_requested',
      idempotencyKey: 'idemp_ref_001',
    });

    expect(refundRes.success).toBe(true);
    expect(refundRes.refundId).toMatch(/^ref_mock_/);
    expect(refundRes.amount.toNumericString()).toBe('49.9900');
    expect(refundRes.status).toBe('succeeded');

    // Payout
    const payoutRes = await adapter.createPayout({
      companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
      amount: new Money('2500.0000'),
      destinationBankAccountId: 'bank_chase_8812',
      currency: 'USD',
      idempotencyKey: 'idemp_po_001',
    });

    expect(payoutRes.success).toBe(true);
    expect(payoutRes.payoutId).toMatch(/^po_mock_/);
    expect(payoutRes.status).toBe('paid');
  });

  it('Step 111.5: verifies cryptographic webhook signatures and parses event payloads', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_9981',
      type: 'charge.captured',
      amount: 14999,
    });
    const secret = 'webhook_test_secret_key_123';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    const validRes = await adapter.verifyWebhook(payload, validSignature, secret);
    expect(validRes.isValid).toBe(true);
    expect(validRes.eventType).toBe('charge.captured');
    expect(validRes.providerEventId).toBe('evt_test_9981');

    const invalidRes = await adapter.verifyWebhook(payload, 'bad_sig', secret);
    expect(invalidRes.isValid).toBe(false);
    expect(invalidRes.failureReason).toContain('mismatch');
  });

  it('Step 111.6: normalizes card declines and gateway errors into standard GatewayError subclasses', async () => {
    // Insufficient funds decline
    await expect(
      adapter.authorizePayment({
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        amount: new Money('200.0000'),
        currency: 'USD',
        paymentMethodToken: 'tok_declined_insufficient_funds',
        idempotencyKey: 'idemp_err_01',
      })
    ).rejects.toThrow(GatewayDeclinedError);

    // Fraud decline
    await expect(
      adapter.authorizePayment({
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        amount: new Money('200.0000'),
        currency: 'USD',
        paymentMethodToken: 'tok_declined_fraud',
        idempotencyKey: 'idemp_err_02',
      })
    ).rejects.toThrow(GatewayDeclinedError);

    // Bad amount -> GatewayInvalidRequestError
    await expect(
      adapter.authorizePayment({
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        amount: new Money('0.0000'), // Zero amount
        currency: 'USD',
        paymentMethodToken: 'tok_valid_visa',
        idempotencyKey: 'idemp_err_03',
      })
    ).rejects.toThrow(GatewayInvalidRequestError);

    // Network timeout adapter simulation
    const timeoutAdapter = new MockPaymentProcessorAdapter({ simulateTimeout: true });
    await expect(
      timeoutAdapter.authorizePayment({
        companyId: '018f6c4c-3500-7fa1-b1e2-999999999abc',
        amount: new Money('50.0000'),
        currency: 'USD',
        paymentMethodToken: 'tok_valid_visa',
        idempotencyKey: 'idemp_err_04',
      })
    ).rejects.toThrow(GatewayNetworkError);
  });
});
