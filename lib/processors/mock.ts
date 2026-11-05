// path: lib/processors/mock.ts

import crypto from 'node:crypto';
import { Money } from '@/lib/money/money';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import {
  PaymentProcessorAdapter,
  AuthorizeRequest,
  ChargeResult,
  CaptureRequest,
  RefundRequest,
  RefundResult,
  PayoutRequest,
  PayoutResult,
  CreateSubMerchantRequest,
  SubMerchantResult,
  WebhookVerificationResult,
  GatewayConnectionTestResult,
  GatewayDeclinedError,
  GatewayInvalidRequestError,
  GatewayNetworkError,
} from '@/lib/processors/types';

export class MockPaymentProcessorAdapter implements PaymentProcessorAdapter {
  readonly providerSlug = 'mock_processor';
  readonly providerDisplayName = 'Mock Developer Sandbox Gateway';

  private isConnected = true;
  private simulateTimeout = false;

  constructor(options?: { isConnected?: boolean; simulateTimeout?: boolean }) {
    if (options?.isConnected !== undefined) this.isConnected = options.isConnected;
    if (options?.simulateTimeout !== undefined) this.simulateTimeout = options.simulateTimeout;
  }

  async testConnection(): Promise<GatewayConnectionTestResult> {
    if (this.simulateTimeout) {
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: 'Connection timed out while reaching mock payment sandbox API.',
      });
    }

    return {
      isConnected: this.isConnected,
      latencyMs: 14,
      environment: 'sandbox',
      apiVersion: '2026-11-01',
      message: this.isConnected
        ? 'Mock payment sandbox gateway connection verified.'
        : 'Mock payment gateway offline.',
    };
  }

  async createSubMerchant(request: CreateSubMerchantRequest): Promise<SubMerchantResult> {
    if (!request.taxId || request.taxId.trim().length === 0) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Missing required tax identifier for sub-merchant onboarding.',
      });
    }

    const providerSubmerchantId = `mock_sub_${request.companyId.replace(/-/g, '').slice(0, 12)}`;

    return {
      success: true,
      providerSubmerchantId,
      status: 'active',
      capabilities: {
        card_payments: true,
        transfers: true,
        payouts: true,
      },
      rawProviderResponse: {
        created_at: new Date().toISOString(),
        livemode: false,
      },
    };
  }

  async authorizePayment(request: AuthorizeRequest): Promise<ChargeResult> {
    if (this.simulateTimeout) {
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: 'Transaction timed out.',
      });
    }

    // Special testing token to trigger card decline
    if (request.paymentMethodToken === 'tok_declined_insufficient_funds') {
      throw new GatewayDeclinedError({
        provider: this.providerSlug,
        message: 'Your card has insufficient funds.',
        declineCode: 'insufficient_funds',
      });
    }

    if (request.paymentMethodToken === 'tok_declined_fraud') {
      throw new GatewayDeclinedError({
        provider: this.providerSlug,
        message: 'Your card was declined due to suspected fraud.',
        declineCode: 'fraudulent',
      });
    }

    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Charge amount must be strictly greater than zero.',
      });
    }

    const transactionId = `tx_mock_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;

    return {
      success: true,
      transactionId,
      status: 'authorized',
      amount: request.amount,
      currency: 'USD',
      authorizationCode: 'AUTH99281',
      avsResultCode: 'Y', // Exact street and 5-digit zip match
      cvvResultCode: 'M', // CVV match
      rawProviderResponse: {
        idempotency_key: request.idempotencyKey,
        captured: false,
      },
    };
  }

  async capturePayment(request: CaptureRequest): Promise<ChargeResult> {
    if (!request.authorizationTransactionId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Missing required authorization transaction identifier.',
      });
    }

    return {
      success: true,
      transactionId: request.authorizationTransactionId,
      status: 'captured',
      amount: request.amount,
      currency: 'USD',
      authorizationCode: 'CAPT88102',
      rawProviderResponse: {
        captured_at: new Date().toISOString(),
      },
    };
  }

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Refund amount must be strictly greater than zero.',
      });
    }

    const refundId = `ref_mock_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;

    return {
      success: true,
      refundId,
      originalTransactionId: request.originalTransactionId,
      amount: request.amount,
      status: 'succeeded',
      rawProviderResponse: {
        refunded_at: new Date().toISOString(),
        reason: request.reason ?? 'requested_by_customer',
      },
    };
  }

  async createPayout(request: PayoutRequest): Promise<PayoutResult> {
    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Payout amount must be greater than zero.',
      });
    }

    const payoutId = `po_mock_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;

    return {
      success: true,
      payoutId,
      amount: request.amount,
      status: 'paid',
      arrivalDateEstimate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      rawProviderResponse: {
        destination_account: request.destinationBankAccountId,
      },
    };
  }

  async verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret: string
  ): Promise<WebhookVerificationResult> {
    if (!signatureHeader || !webhookSecret) {
      return { isValid: false, failureReason: 'Missing signature header or secret' };
    }

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    if (signatureHeader.trim().toLowerCase() !== expectedSig.toLowerCase()) {
      return { isValid: false, failureReason: 'Signature mismatch' };
    }

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      return {
        isValid: true,
        eventType: (parsed['type'] as string) ?? 'charge.succeeded',
        providerEventId: (parsed['id'] as string) ?? 'evt_mock_001',
        parsedPayload: parsed,
      };
    } catch {
      return { isValid: false, failureReason: 'Malformed JSON payload' };
    }
  }
}
