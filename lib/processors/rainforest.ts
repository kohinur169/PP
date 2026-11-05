// path: lib/processors/rainforest.ts

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

export const DEFAULT_RAINFOREST_BASE_URL = 'https://api.sandbox.rainforestpay.com/v1';

export interface RainforestAdapterConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  httpClient?: typeof fetch | undefined;
}

export interface RainforestMerchantPayload {
  merchant: {
    name: string;
    dba_name?: string | undefined;
    tax_id: string;
    mcc: string;
    representative: {
      email: string;
      country: string;
    };
  };
}

export interface RainforestPayinPayload {
  merchant_id: string;
  amount: number; // In cents
  payment_method_id: string;
  capture: boolean;
  currency: 'USD';
  idempotency_key: string;
}

/**
 * Official Rainforest (rainforestpay.com) Payment Processor Adapter.
 * Integrates with Rainforest Components and REST API for embedded PayFac operations.
 */
export class RainforestAdapter implements PaymentProcessorAdapter {
  readonly providerSlug = 'rainforest';
  readonly providerDisplayName = 'Rainforest Pay';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly httpClient: typeof fetch;

  constructor(config: RainforestAdapterConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new GatewayAuthError({
        provider: this.providerSlug,
        message: 'Rainforest API key is strictly required.',
      });
    }
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl ?? DEFAULT_RAINFOREST_BASE_URL;
    this.httpClient = config.httpClient ?? fetch;
  }

  /**
   * Tests API connectivity to Rainforest platform.
   */
  async testConnection(): Promise<GatewayConnectionTestResult> {
    const startTime = Date.now();
    try {
      if (this.baseUrl.startsWith('mock://') || this.apiKey.includes('mock')) {
        return {
          isConnected: true,
          latencyMs: 12,
          environment: 'sandbox',
          apiVersion: 'v1 REST',
          message: 'Rainforest API connection verified.',
        };
      }

      const response = await this.httpClient(`${this.baseUrl}/merchants`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const latencyMs = Date.now() - startTime;
      const isConnected = response.status === 200 || response.status === 400; // Auth check

      if (response.status === 401 || response.status === 403) {
        throw new GatewayAuthError({
          provider: this.providerSlug,
          message: 'Rainforest API key failed authentication.',
        });
      }

      return {
        isConnected,
        latencyMs,
        environment: this.baseUrl.includes('sandbox') ? 'sandbox' : 'production',
        apiVersion: 'v1 REST',
        message: 'Rainforest Pay API authenticated.',
      };
    } catch (err: unknown) {
      if (err instanceof GatewayAuthError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Rainforest connection failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Provisions a merchant entity on Rainforest.
   */
  async createSubMerchant(request: CreateSubMerchantRequest): Promise<SubMerchantResult> {
    if (!request.legalBusinessName || !request.taxId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Legal business name and tax ID are required for Rainforest onboarding.',
      });
    }

    if (this.baseUrl.startsWith('mock://') || this.apiKey.includes('mock')) {
      const merchantId = `rf_mer_${generateUuidV7().replace(/-/g, '').slice(0, 12)}`;
      return {
        success: true,
        providerSubmerchantId: merchantId,
        status: 'active',
        capabilities: {
          card_payments: true,
          transfers: true,
          payouts: true,
        },
        rawProviderResponse: {
          merchant_id: merchantId,
          created_at: new Date().toISOString(),
        },
      };
    }

    try {
      const payload: RainforestMerchantPayload = {
        merchant: {
          name: request.legalBusinessName,
          dba_name: request.dbaName ?? request.legalBusinessName,
          tax_id: request.taxId.replace(/[^0-9]/g, ''),
          mcc: request.mccCode,
          representative: {
            email: request.representativeEmail,
            country: request.countryCode,
          },
        },
      };

      const response = await this.httpClient(`${this.baseUrl}/merchants`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Rainforest merchant creation failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { merchant_id: string; status?: string };
      return {
        success: true,
        providerSubmerchantId: resData.merchant_id,
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
        message: `Network error contacting Rainforest merchant API: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Authorizes a card payment using a Rainforest payment method token.
   */
  async authorizePayment(request: AuthorizeRequest): Promise<ChargeResult> {
    if (!request.paymentMethodToken) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Rainforest payment_method_id token is required.',
      });
    }

    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Charge amount must be strictly greater than zero.',
      });
    }

    // Convert decimal to cents integer
    const cents = Math.round(Number(request.amount.toDisplayString(false)) * 100);

    if (this.baseUrl.startsWith('mock://') || this.apiKey.includes('mock')) {
      if (request.paymentMethodToken.includes('declined')) {
        throw new GatewayDeclinedError({
          provider: this.providerSlug,
          message: 'The card was declined.',
          declineCode: 'card_declined',
        });
      }

      const txId = `rf_payin_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;
      return {
        success: true,
        transactionId: txId,
        status: 'authorized',
        amount: request.amount,
        currency: 'USD',
        authorizationCode: 'RF_AUTH_882',
        avsResultCode: 'MATCH',
        cvvResultCode: 'MATCH',
        rawProviderResponse: {
          payin_id: txId,
          captured: false,
        },
      };
    }

    try {
      const payload: RainforestPayinPayload = {
        merchant_id: request.submerchantId ?? `mer_${request.companyId}`,
        amount: cents,
        payment_method_id: request.paymentMethodToken,
        capture: false,
        currency: 'USD',
        idempotency_key: request.idempotencyKey,
      };

      const response = await this.httpClient(`${this.baseUrl}/payins`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': request.idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 402 || errText.includes('decline')) {
          throw new GatewayDeclinedError({
            provider: this.providerSlug,
            message: `Card declined: ${errText}`,
          });
        }
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Rainforest payin failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { payin_id: string; status: string };
      return {
        success: true,
        transactionId: resData.payin_id,
        status: 'authorized',
        amount: request.amount,
        currency: 'USD',
        authorizationCode: 'RF_AUTH_LIVE',
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayDeclinedError || err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Rainforest payin network error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Captures an authorized Rainforest payin.
   */
  async capturePayment(request: CaptureRequest): Promise<ChargeResult> {
    if (!request.authorizationTransactionId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'authorizationTransactionId is required to capture Rainforest payment.',
      });
    }

    if (this.baseUrl.startsWith('mock://') || this.apiKey.includes('mock')) {
      return {
        success: true,
        transactionId: request.authorizationTransactionId,
        status: 'captured',
        amount: request.amount,
        currency: 'USD',
        authorizationCode: 'RF_CAPT_882',
      };
    }

    try {
      const response = await this.httpClient(
        `${this.baseUrl}/payins/${request.authorizationTransactionId}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': request.idempotencyKey,
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Rainforest capture failed: ${errText}`,
        });
      }

      return {
        success: true,
        transactionId: request.authorizationTransactionId,
        status: 'captured',
        amount: request.amount,
        currency: 'USD',
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Rainforest capture network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Issues a refund against a captured Rainforest payin.
   */
  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    if (!request.originalTransactionId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'originalTransactionId is required for refund.',
      });
    }

    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Refund amount must be strictly greater than zero.',
      });
    }

    const cents = Math.round(Number(request.amount.toDisplayString(false)) * 100);

    if (this.baseUrl.startsWith('mock://') || this.apiKey.includes('mock')) {
      const refundId = `rf_ref_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;
      return {
        success: true,
        refundId,
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
        status: 'succeeded',
      };
    }

    try {
      const response = await this.httpClient(
        `${this.baseUrl}/payins/${request.originalTransactionId}/refund`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': request.idempotencyKey,
          },
          body: JSON.stringify({
            amount: cents,
            reason: request.reason ?? 'requested_by_customer',
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Rainforest refund failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { refund_id: string; status: string };
      return {
        success: true,
        refundId: resData.refund_id,
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
        status: 'succeeded',
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Rainforest refund network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Rainforest embedded payout disbursement to sub-merchant bank account.
   */
  async createPayout(request: PayoutRequest): Promise<PayoutResult> {
    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Payout amount must be greater than zero.',
      });
    }

    const cents = Math.round(Number(request.amount.toDisplayString(false)) * 100);

    if (this.baseUrl.startsWith('mock://') || this.apiKey.includes('mock')) {
      const payoutId = `rf_payout_${generateUuidV7().replace(/-/g, '').slice(0, 14)}`;
      return {
        success: true,
        payoutId,
        amount: request.amount,
        status: 'in_transit',
        arrivalDateEstimate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      };
    }

    try {
      const response = await this.httpClient(`${this.baseUrl}/payouts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': request.idempotencyKey,
        },
        body: JSON.stringify({
          merchant_id: request.submerchantId ?? `mer_${request.companyId}`,
          amount: cents,
          destination_bank_account_id: request.destinationBankAccountId,
          currency: 'USD',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Rainforest payout failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { payout_id: string; status: string };
      return {
        success: true,
        payoutId: resData.payout_id,
        amount: request.amount,
        status: 'in_transit',
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Rainforest payout network failure: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Cryptographically validates Rainforest HMAC-SHA256 webhook signature.
   */
  async verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret: string
  ): Promise<WebhookVerificationResult> {
    if (!signatureHeader || !webhookSecret) {
      return { isValid: false, failureReason: 'Missing webhook signature or secret.' };
    }

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const sigBuffer = Buffer.from(signatureHeader, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { isValid: false, failureReason: 'Rainforest webhook signature mismatch.' };
    }

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      return {
        isValid: true,
        eventType: (parsed['type'] as string) ?? (parsed['event_type'] as string) ?? 'payin.succeeded',
        providerEventId: (parsed['id'] as string) ?? (parsed['event_id'] as string) ?? `rf_evt_${generateUuidV7().slice(0, 8)}`,
        parsedPayload: parsed,
      };
    } catch {
      return { isValid: false, failureReason: 'Malformed Rainforest webhook JSON.' };
    }
  }
}
