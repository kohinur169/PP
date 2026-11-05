// path: lib/processors/airwallex.ts

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
  GatewayAuthError,
  GatewayDeclinedError,
  GatewayInvalidRequestError,
  GatewayNetworkError,
} from '@/lib/processors/types';

export const DEFAULT_AIRWALLEX_BASE_URL = 'https://api-demo.airwallex.com/api/v1';

export interface AirwallexAdapterConfig {
  clientId: string;
  apiKey: string;
  baseUrl?: string | undefined;
  webhookSecret?: string | undefined;
  httpClient?: typeof fetch | undefined;
}

export interface AirwallexAuthResponse {
  token: string;
  expires_at: string;
}

/**
 * Official Airwallex Adapter.
 * Supports connected accounts, PaymentIntents with local & global payment methods,
 * refunds, and global SWIFT / local clearing payouts in USD.
 */
export class AirwallexAdapter implements PaymentProcessorAdapter {
  readonly providerSlug = 'airwallex';
  readonly providerDisplayName = 'Airwallex';

  private readonly clientId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookSecret?: string | undefined;
  private readonly httpClient: typeof fetch;

  private cachedBearerToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: AirwallexAdapterConfig) {
    if (!config.clientId || !config.apiKey) {
      throw new GatewayAuthError({
        provider: this.providerSlug,
        message: 'Airwallex clientId and apiKey are strictly required.',
      });
    }

    this.clientId = config.clientId.trim();
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl ?? DEFAULT_AIRWALLEX_BASE_URL;
    this.webhookSecret = config.webhookSecret;
    this.httpClient = config.httpClient ?? fetch;
  }

  /**
   * Retrieves or refreshes the temporary bearer authentication token from Airwallex.
   */
  async getAuthToken(): Promise<string> {
    if (this.cachedBearerToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedBearerToken;
    }

    if (this.clientId.includes('mock') || this.baseUrl.startsWith('mock://')) {
      this.cachedBearerToken = `mock_awx_token_${generateUuidV7().replace(/-/g, '').slice(0, 12)}`;
      this.tokenExpiresAt = Date.now() + 30 * 60 * 1000;
      return this.cachedBearerToken;
    }

    try {
      const response = await this.httpClient(`${this.baseUrl}/authentication/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': this.clientId,
          'x-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new GatewayAuthError({
          provider: this.providerSlug,
          message: `Airwallex authentication failed with status ${response.status}`,
          httpStatus: response.status,
        });
      }

      const data = (await response.json()) as AirwallexAuthResponse;
      this.cachedBearerToken = data.token;
      this.tokenExpiresAt = new Date(data.expires_at).getTime();
      return this.cachedBearerToken;
    } catch (err: unknown) {
      if (err instanceof GatewayAuthError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Failed to authenticate with Airwallex: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Tests API connectivity and authentication validity.
   */
  async testConnection(): Promise<GatewayConnectionTestResult> {
    const startTime = Date.now();
    try {
      const token = await this.getAuthToken();
      const latencyMs = Date.now() - startTime;

      return {
        isConnected: Boolean(token),
        latencyMs,
        environment: this.baseUrl.includes('demo') ? 'sandbox' : 'production',
        apiVersion: 'v1 Scale API',
        message: 'Airwallex API connection verified successfully.',
      };
    } catch (err: unknown) {
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Airwallex connection test failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Creates an Airwallex Connected Account for a sub-merchant.
   */
  async createSubMerchant(request: CreateSubMerchantRequest): Promise<SubMerchantResult> {
    if (!request.legalBusinessName || !request.representativeEmail) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Legal business name and representative email are required for Airwallex onboarding.',
      });
    }

    const token = await this.getAuthToken();

    if (this.baseUrl.startsWith('mock://') || this.clientId.includes('mock')) {
      const accountId = `awx_acct_${generateUuidV7().replace(/-/g, '').slice(0, 12)}`;
      return {
        success: true,
        providerSubmerchantId: accountId,
        status: 'active',
        capabilities: {
          card_payments: true,
          transfers: true,
          payouts: true,
        },
        rawProviderResponse: {
          account_id: accountId,
          business_name: request.legalBusinessName,
        },
      };
    }

    try {
      const response = await this.httpClient(`${this.baseUrl}/accounts/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          primary_contact: {
            email: request.representativeEmail,
          },
          business_details: {
            legal_name: request.legalBusinessName,
            mcc: request.mccCode,
            business_registration_number: request.taxId,
            address: {
              country_code: request.countryCode,
            },
          },
          metadata: {
            company_id: request.companyId,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Airwallex connected account creation failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { id: string; status?: string };
      return {
        success: true,
        providerSubmerchantId: resData.id,
        status: 'active',
        capabilities: {
          card_payments: true,
          transfers: true,
          payouts: true,
        },
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Failed to create Airwallex account: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Authorizes payment via Airwallex PaymentIntent API.
   */
  async authorizePayment(request: AuthorizeRequest): Promise<ChargeResult> {
    if (!request.paymentMethodToken) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Payment method token / payment consent ID is required.',
      });
    }

    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Charge amount must be strictly greater than zero.',
      });
    }

    const token = await this.getAuthToken();
    const amountNumber = Number(request.amount.toDisplayString(false));

    if (this.baseUrl.startsWith('mock://') || this.clientId.includes('mock')) {
      if (request.paymentMethodToken.includes('declined')) {
        throw new GatewayDeclinedError({
          provider: this.providerSlug,
          message: 'The card transaction was declined.',
          declineCode: 'transaction_declined',
        });
      }

      const intentId = `int_awx_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;
      return {
        success: true,
        transactionId: intentId,
        status: 'authorized',
        amount: request.amount,
        currency: 'USD',
        authorizationCode: 'AWX_AUTH_991',
        rawProviderResponse: {
          intent_id: intentId,
          status: 'REQUIRES_CAPTURE',
        },
      };
    }

    try {
      const response = await this.httpClient(`${this.baseUrl}/pa/payment_intents/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-idempotency-key': request.idempotencyKey,
        },
        body: JSON.stringify({
          request_id: request.idempotencyKey,
          amount: amountNumber,
          currency: 'USD',
          merchant_order_id: request.orderId ?? request.idempotencyKey,
          connected_account_id: request.submerchantId,
          capture_method: 'MANUAL', // Two-step authorization
          customer_email: request.customerEmail,
          payment_method: {
            id: request.paymentMethodToken,
          },
          confirm: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 402 || errText.includes('declined')) {
          throw new GatewayDeclinedError({
            provider: this.providerSlug,
            message: `Airwallex payment declined: ${errText}`,
          });
        }
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Airwallex PaymentIntent creation failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { id: string; status: string; latest_charge?: { auth_code?: string } };
      return {
        success: true,
        transactionId: resData.id,
        status: 'authorized',
        amount: request.amount,
        currency: 'USD',
        authorizationCode: resData.latest_charge?.auth_code ?? 'AWX_LIVE_AUTH',
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayDeclinedError || err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Airwallex payment authorization network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Captures an authorized Airwallex PaymentIntent.
   */
  async capturePayment(request: CaptureRequest): Promise<ChargeResult> {
    if (!request.authorizationTransactionId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'authorizationTransactionId is required to capture Airwallex payment.',
      });
    }

    const token = await this.getAuthToken();
    const amountNumber = Number(request.amount.toDisplayString(false));

    if (this.baseUrl.startsWith('mock://') || this.clientId.includes('mock')) {
      return {
        success: true,
        transactionId: request.authorizationTransactionId,
        status: 'captured',
        amount: request.amount,
        currency: 'USD',
      };
    }

    try {
      const response = await this.httpClient(
        `${this.baseUrl}/pa/payment_intents/${request.authorizationTransactionId}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-idempotency-key': request.idempotencyKey,
          },
          body: JSON.stringify({
            request_id: request.idempotencyKey,
            amount: amountNumber,
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Airwallex capture failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { id: string; status: string };
      return {
        success: true,
        transactionId: resData.id,
        status: 'captured',
        amount: request.amount,
        currency: 'USD',
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Airwallex capture network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Refunds a captured Airwallex payment.
   */
  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    if (!request.originalTransactionId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'originalTransactionId is required for Airwallex refund.',
      });
    }

    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Refund amount must be strictly greater than zero.',
      });
    }

    const token = await this.getAuthToken();
    const amountNumber = Number(request.amount.toDisplayString(false));

    if (this.baseUrl.startsWith('mock://') || this.clientId.includes('mock')) {
      const refundId = `ref_awx_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;
      return {
        success: true,
        refundId,
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
        status: 'succeeded',
      };
    }

    try {
      const response = await this.httpClient(`${this.baseUrl}/pa/refunds/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-idempotency-key': request.idempotencyKey,
        },
        body: JSON.stringify({
          request_id: request.idempotencyKey,
          payment_intent_id: request.originalTransactionId,
          amount: amountNumber,
          reason: request.reason ?? 'customer_request',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Airwallex refund failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { id: string; status: string };
      return {
        success: true,
        refundId: resData.id,
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
        status: 'succeeded',
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Airwallex refund network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Dispatches a global cross-border payout in USD via Airwallex Payouts API.
   */
  async createPayout(request: PayoutRequest): Promise<PayoutResult> {
    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Payout amount must be greater than zero.',
      });
    }

    const token = await this.getAuthToken();
    const amountNumber = Number(request.amount.toDisplayString(false));

    if (this.baseUrl.startsWith('mock://') || this.clientId.includes('mock')) {
      const payoutId = `po_awx_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;
      return {
        success: true,
        payoutId,
        amount: request.amount,
        status: 'in_transit',
        arrivalDateEstimate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      };
    }

    try {
      const response = await this.httpClient(`${this.baseUrl}/payouts/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-idempotency-key': request.idempotencyKey,
        },
        body: JSON.stringify({
          request_id: request.idempotencyKey,
          source_currency: 'USD',
          payment_currency: 'USD',
          payment_amount: amountNumber,
          beneficiary_id: request.destinationBankAccountId,
          reference: request.description ?? 'Merchant Settlement Payout',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Airwallex payout dispatch failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { id: string; status: string };
      return {
        success: true,
        payoutId: resData.id,
        amount: request.amount,
        status: resData.status === 'PAID' ? 'paid' : 'in_transit',
        arrivalDateEstimate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Airwallex payout network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Cryptographically verifies Airwallex webhook notification signature using HMAC-SHA256.
   */
  async verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret?: string
  ): Promise<WebhookVerificationResult> {
    const secret = webhookSecret ?? this.webhookSecret;
    if (!signatureHeader || !secret) {
      return { isValid: false, failureReason: 'Missing Airwallex signature or webhook secret.' };
    }

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const sigBuffer = Buffer.from(signatureHeader, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { isValid: false, failureReason: 'Airwallex webhook signature verification failed.' };
    }

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      return {
        isValid: true,
        eventType: (parsed['name'] as string) ?? (parsed['type'] as string) ?? 'payment_intent.succeeded',
        providerEventId: (parsed['id'] as string) ?? `awx_evt_${generateUuidV7().slice(0, 8)}`,
        parsedPayload: parsed,
      };
    } catch {
      return { isValid: false, failureReason: 'Malformed Airwallex webhook payload JSON.' };
    }
  }
}
