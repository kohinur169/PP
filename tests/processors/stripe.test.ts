// path: tests/processors/stripe.test.ts

import { describe, it, expect, vi } from 'vitest';
import Stripe from 'stripe';
import { StripeAdapter } from '@/lib/processors/stripe';
import { Money } from '@/lib/money/money';
import {
  GatewayAuthError,
  GatewayDeclinedError,
  GatewayInvalidRequestError,
} from '@/lib/processors/types';

describe('Step 117: Stripe Connect Custom & Express Sub-Merchant Adapter', () => {
  const dummyApiKey = 'sk_test_51MockStripeKeyForUnitTesting9928174';

  describe('Step 117.1: Adapter Initialization & Configuration', () => {
    it('initializes Stripe adapter with valid secret key', () => {
      const adapter = new StripeAdapter({ apiKey: dummyApiKey });
      expect(adapter.providerSlug).toBe('stripe_connect');
      expect(adapter.providerDisplayName).toBe('Stripe Connect');
    });

    it('throws GatewayAuthError when API secret key is missing', () => {
      expect(() => new StripeAdapter({ apiKey: '   ' })).toThrow(GatewayAuthError);
    });
  });

  describe('Step 117.2: Connected Account Sub-Merchant Creation', () => {
    it('creates custom connected account requesting card_payments and transfers capabilities', async () => {
      const mockAccountsCreate = vi.fn().mockResolvedValue({
        id: 'acct_1MockConnectedMerchant99',
        object: 'account',
        charges_enabled: true,
        payouts_enabled: true,
        capabilities: {
          card_payments: 'active',
          transfers: 'active',
        },
      });

      const mockStripe = {
        accounts: { create: mockAccountsCreate },
      } as unknown as Stripe;

      const adapter = new StripeAdapter({
        apiKey: dummyApiKey,
        stripeClient: mockStripe,
      });

      const result = await adapter.createSubMerchant({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        legalBusinessName: 'Apex Stripe Merchant LLC',
        dbaName: 'Apex Store',
        mccCode: '5732',
        taxId: '12-3456789',
        representativeEmail: 'merchant@apexstore.com',
        countryCode: 'US',
      });

      expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
      const callArg = mockAccountsCreate.mock.calls[0][0];
      expect(callArg.type).toBe('custom');
      expect(callArg.capabilities.card_payments.requested).toBe(true);
      expect(callArg.capabilities.transfers.requested).toBe(true);
      expect(callArg.business_profile.mcc).toBe('5732');

      expect(result.success).toBe(true);
      expect(result.providerSubmerchantId).toBe('acct_1MockConnectedMerchant99');
      expect(result.status).toBe('active');
      expect(result.capabilities.card_payments).toBe(true);
      expect(result.capabilities.transfers).toBe(true);
      expect(result.capabilities.payouts).toBe(true);
    });
  });

  describe('Step 117.3: Destination Charges & PaymentIntents', () => {
    it('authorizes two-step destination charge with application fee', async () => {
      const mockPaymentIntentsCreate = vi.fn().mockResolvedValue({
        id: 'pi_3MockPaymentIntent992',
        object: 'payment_intent',
        amount: 15000, // $150.00
        currency: 'usd',
        status: 'requires_capture',
        latest_charge: {
          authorization_code: 'STRIPE_AUTH_992',
        },
      });

      const mockStripe = {
        paymentIntents: { create: mockPaymentIntentsCreate },
      } as unknown as Stripe;

      const adapter = new StripeAdapter({
        apiKey: dummyApiKey,
        stripeClient: mockStripe,
      });

      const result = await adapter.authorizePayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        submerchantId: 'acct_1MockConnectedMerchant99',
        amount: Money.from(150.0),
        currency: 'USD',
        paymentMethodToken: 'pm_card_visa',
        idempotencyKey: 'idem_stripe_pi_01',
        metadata: {
          applicationFeeCents: 225, // $2.25 platform fee
        },
      });

      expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
      const callParams = mockPaymentIntentsCreate.mock.calls[0][0];
      expect(callParams.amount).toBe(15000);
      expect(callParams.capture_method).toBe('manual');
      expect(callParams.transfer_data.destination).toBe('acct_1MockConnectedMerchant99');
      expect(callParams.application_fee_amount).toBe(225);

      expect(result.success).toBe(true);
      expect(result.status).toBe('authorized');
      expect(result.transactionId).toBe('pi_3MockPaymentIntent992');
      expect(result.authorizationCode).toBe('STRIPE_AUTH_992');
    });

    it('handles card decline error and throws GatewayDeclinedError', async () => {
      const cardError = new Stripe.errors.StripeCardError({
        message: 'Your card has insufficient funds.',
        type: 'card_error',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
      });

      const mockStripe = {
        paymentIntents: {
          create: vi.fn().mockRejectedValue(cardError),
        },
      } as unknown as Stripe;

      const adapter = new StripeAdapter({
        apiKey: dummyApiKey,
        stripeClient: mockStripe,
      });

      await expect(
        adapter.authorizePayment({
          companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
          amount: Money.from(50.0),
          currency: 'USD',
          paymentMethodToken: 'pm_card_insufficient',
          idempotencyKey: 'idem_stripe_declined',
        })
      ).rejects.toThrow(GatewayDeclinedError);
    });

    it('captures previously authorized PaymentIntent', async () => {
      const mockCapture = vi.fn().mockResolvedValue({
        id: 'pi_3MockPaymentIntent992',
        object: 'payment_intent',
        status: 'succeeded',
      });

      const mockStripe = {
        paymentIntents: { capture: mockCapture },
      } as unknown as Stripe;

      const adapter = new StripeAdapter({
        apiKey: dummyApiKey,
        stripeClient: mockStripe,
      });

      const capture = await adapter.capturePayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        authorizationTransactionId: 'pi_3MockPaymentIntent992',
        amount: Money.from(150.0),
        idempotencyKey: 'idem_stripe_capt_01',
      });

      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(capture.success).toBe(true);
      expect(capture.status).toBe('captured');
      expect(capture.transactionId).toBe('pi_3MockPaymentIntent992');
    });

    it('creates refund against PaymentIntent', async () => {
      const mockRefundCreate = vi.fn().mockResolvedValue({
        id: 're_3MockRefund001',
        object: 'refund',
        status: 'succeeded',
      });

      const mockStripe = {
        refunds: { create: mockRefundCreate },
      } as unknown as Stripe;

      const adapter = new StripeAdapter({
        apiKey: dummyApiKey,
        stripeClient: mockStripe,
      });

      const refund = await adapter.refundPayment({
        companyId: '01a1aa91-3500-7fa1-b1e2-123456789abc',
        originalTransactionId: 'pi_3MockPaymentIntent992',
        amount: Money.from(50.0),
        idempotencyKey: 'idem_stripe_ref_01',
      });

      expect(mockRefundCreate).toHaveBeenCalledTimes(1);
      expect(refund.success).toBe(true);
      expect(refund.refundId).toBe('re_3MockRefund001');
      expect(refund.status).toBe('succeeded');
    });
  });

  describe('Step 117.4: Webhook Signature Verification', () => {
    it('verifies valid webhook signature via Stripe SDK constructEvent', async () => {
      const mockConstructEvent = vi.fn().mockReturnValue({
        id: 'evt_1MockStripeEvent99',
        type: 'payment_intent.succeeded',
        data: {
          object: { id: 'pi_3MockPaymentIntent992' },
        },
      });

      const mockStripe = {
        webhooks: { constructEvent: mockConstructEvent },
      } as unknown as Stripe;

      const adapter = new StripeAdapter({
        apiKey: dummyApiKey,
        stripeClient: mockStripe,
      });

      const verification = await adapter.verifyWebhook(
        '{"id":"evt_1MockStripeEvent99"}',
        't=1600000000,v1=valid_sig',
        'whsec_test_secret'
      );

      expect(verification.isValid).toBe(true);
      expect(verification.eventType).toBe('payment_intent.succeeded');
      expect(verification.providerEventId).toBe('evt_1MockStripeEvent99');
    });

    it('fails verification gracefully when signature header is missing or invalid', async () => {
      const mockConstructEvent = vi.fn().mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      const mockStripe = {
        webhooks: { constructEvent: mockConstructEvent },
      } as unknown as Stripe;

      const adapter = new StripeAdapter({
        apiKey: dummyApiKey,
        stripeClient: mockStripe,
      });

      const verification = await adapter.verifyWebhook('{}', 'invalid_sig', 'whsec_test_secret');
      expect(verification.isValid).toBe(false);
      expect(verification.failureReason).toContain('signatures');
    });
  });
});
