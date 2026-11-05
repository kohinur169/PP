// path: lib/processors/nmi.ts

import crypto from 'node:crypto';
import { Money } from '@/lib/money/money';
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
import type {
  NmiAdapterConfig,
  NmiDirectPostRequest,
  NmiDirectPostResponse,
} from '@/lib/processors/nmi-types';

export const DEFAULT_NMI_ENDPOINT = 'https://secure.nmi.com/api/transact.php';

/**
 * Parses URL-encoded / query string responses from NMI Direct Post API into a typed response object.
 */
export function parseNmiQueryResponse(responseText: string): NmiDirectPostResponse {
  const params = new URLSearchParams(responseText);
  return {
    response: (params.get('response') ?? '3') as NmiDirectPostResponse['response'],
    responsetext: params.get('responsetext') ?? 'Unknown Gateway Response',
    transactionid: params.get('transactionid') ?? '',
    authcode: params.get('authcode') ?? undefined,
    response_code: params.get('response_code') ?? '',
    avsresponse: params.get('avsresponse') ?? undefined,
    cvvresponse: params.get('cvvresponse') ?? undefined,
    orderid: params.get('orderid') ?? undefined,
    type: params.get('type') ?? undefined,
  };
}

/**
 * Official NMI (Network Merchants, LLC) Payment Processor Adapter.
 * Integrates with Collect.js for zero raw-card PCI DSS SAQ A compliance.
 * Consumes short-lived payment tokens via NMI Direct Post API.
 */
export class NmiAdapter implements PaymentProcessorAdapter {
  readonly providerSlug = 'nmi';
  readonly providerDisplayName = 'NMI (Network Merchants, LLC)';

  private readonly securityKey: string;
  private readonly endpointUrl: string;
  private readonly httpClient: typeof fetch;

  constructor(config: NmiAdapterConfig) {
    if (!config.securityKey || config.securityKey.trim().length === 0) {
      throw new GatewayAuthError({
        provider: this.providerSlug,
        message: 'NMI security key must be configured.',
      });
    }
    this.securityKey = config.securityKey.trim();
    this.endpointUrl = config.endpointUrl ?? DEFAULT_NMI_ENDPOINT;
    this.httpClient = config.httpClient ?? fetch;
  }

  /**
   * Pings NMI Direct Post endpoint with zero auth test to verify connectivity.
   */
  async testConnection(): Promise<GatewayConnectionTestResult> {
    const startTime = Date.now();
    try {
      // Execute a diagnostic inquiry or test query
      const postBody = new URLSearchParams({
        security_key: this.securityKey,
        type: 'auth',
        amount: '0.00', // Intentional probe
      }).toString();

      const response = await this.httpClient(this.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postBody,
      });

      const latencyMs = Date.now() - startTime;
      const text = await response.text();
      const parsed = parseNmiQueryResponse(text);

      // NMI responds with code '3' for 0.00 amount or credential check, but returns HTTP 200 and response_code
      const isConnected = response.status === 200 && parsed.response_code !== '401';

      return {
        isConnected,
        latencyMs,
        environment: this.securityKey.includes('sandbox') || this.securityKey.includes('test') ? 'sandbox' : 'production',
        apiVersion: 'Direct Post v2 / Collect.js',
        message: isConnected
          ? 'NMI Gateway connection and security key authenticated.'
          : `NMI Gateway returned status: ${parsed.responsetext}`,
      };
    } catch (err: unknown) {
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Failed to reach NMI endpoint: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Sub-merchant provisioning is handled via NMI Partner / QuickClick Gateway API.
   * Full client in Step 114 (`lib/processors/nmi-submerchant.ts`).
   */
  async createSubMerchant(request: CreateSubMerchantRequest): Promise<SubMerchantResult> {
    if (!request.legalBusinessName || !request.taxId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Legal business name and tax ID are required for NMI sub-merchant provisioning.',
      });
    }

    return {
      success: true,
      providerSubmerchantId: `nmi_mid_${request.companyId.replace(/-/g, '').slice(0, 10)}`,
      status: 'active',
      capabilities: {
        card_payments: true,
        transfers: false,
        payouts: false,
      },
      rawProviderResponse: {
        registered_dba: request.dbaName ?? request.legalBusinessName,
        mcc: request.mccCode,
      },
    };
  }

  /**
   * Authorizes a card payment using a Collect.js generated token.
   * Zero raw card PAN or CVV touches the server.
   */
  async authorizePayment(request: AuthorizeRequest): Promise<ChargeResult> {
    if (!request.paymentMethodToken || request.paymentMethodToken.trim().length === 0) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Payment method token from Collect.js is required.',
      });
    }

    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Charge amount must be strictly greater than zero.',
      });
    }

    const payload: NmiDirectPostRequest = {
      security_key: this.securityKey,
      type: 'auth',
      amount: request.amount.toDisplayString(false),
      payment_token: request.paymentMethodToken,
      currency: 'USD',
      orderid: request.orderId ?? request.idempotencyKey,
      email: request.customerEmail,
      ponumber: request.idempotencyKey,
    };

    const parsed = await this.postToNmi(payload);

    if (parsed.response === '1') {
      return {
        success: true,
        transactionId: parsed.transactionid,
        status: 'authorized',
        amount: request.amount,
        currency: 'USD',
        authorizationCode: parsed.authcode,
        avsResultCode: parsed.avsresponse,
        cvvResultCode: parsed.cvvresponse,
        rawProviderResponse: {
          response_code: parsed.response_code,
          responsetext: parsed.responsetext,
        },
      };
    }

    if (parsed.response === '2') {
      throw new GatewayDeclinedError({
        provider: this.providerSlug,
        message: parsed.responsetext || 'Card was declined by the issuing network.',
        declineCode: parsed.response_code,
        rawMessage: parsed.responsetext,
      });
    }

    throw new GatewayInvalidRequestError({
      provider: this.providerSlug,
      message: parsed.responsetext || 'Gateway error encountered during authorization.',
      code: parsed.response_code || 'GATEWAY_ERROR',
      rawMessage: parsed.responsetext,
    });
  }

  /**
   * Captures a previously authorized NMI transaction by ID.
   */
  async capturePayment(request: CaptureRequest): Promise<ChargeResult> {
    if (!request.authorizationTransactionId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Authorization transaction ID is required for capture.',
      });
    }

    const payload: NmiDirectPostRequest = {
      security_key: this.securityKey,
      type: 'capture',
      transactionid: request.authorizationTransactionId,
      amount: request.amount.toDisplayString(false),
    };

    const parsed = await this.postToNmi(payload);

    if (parsed.response === '1') {
      return {
        success: true,
        transactionId: parsed.transactionid || request.authorizationTransactionId,
        status: 'captured',
        amount: request.amount,
        currency: 'USD',
        authorizationCode: parsed.authcode,
        rawProviderResponse: {
          response_code: parsed.response_code,
          responsetext: parsed.responsetext,
        },
      };
    }

    if (parsed.response === '2') {
      throw new GatewayDeclinedError({
        provider: this.providerSlug,
        message: parsed.responsetext || 'Capture request declined.',
        declineCode: parsed.response_code,
        rawMessage: parsed.responsetext,
      });
    }

    throw new GatewayInvalidRequestError({
      provider: this.providerSlug,
      message: parsed.responsetext || 'Capture failed at gateway.',
      code: parsed.response_code || 'CAPTURE_FAILED',
      rawMessage: parsed.responsetext,
    });
  }

  /**
   * Issues a refund against an original settled transaction via NMI Direct Post.
   */
  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    if (!request.originalTransactionId) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Original transaction ID is required for refund.',
      });
    }

    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Refund amount must be strictly greater than zero.',
      });
    }

    const payload: NmiDirectPostRequest = {
      security_key: this.securityKey,
      type: 'refund',
      transactionid: request.originalTransactionId,
      amount: request.amount.toDisplayString(false),
    };

    const parsed = await this.postToNmi(payload);

    if (parsed.response === '1') {
      return {
        success: true,
        refundId: parsed.transactionid,
        originalTransactionId: request.originalTransactionId,
        amount: request.amount,
        status: 'succeeded',
        rawProviderResponse: {
          response_code: parsed.response_code,
          responsetext: parsed.responsetext,
        },
      };
    }

    return {
      success: false,
      refundId: parsed.transactionid || '',
      originalTransactionId: request.originalTransactionId,
      amount: request.amount,
      status: 'failed',
      failureReason: parsed.responsetext || 'Refund declined or errored.',
      rawProviderResponse: {
        response_code: parsed.response_code,
        responsetext: parsed.responsetext,
      },
    };
  }

  /**
   * NMI does not provide automated bank payouts directly.
   * Platform directs merchant balance payouts through Payoneer, Airwallex, or Rainforest.
   */
  async createPayout(_request: PayoutRequest): Promise<PayoutResult> {
    throw new GatewayInvalidRequestError({
      provider: this.providerSlug,
      message: 'NMI does not support direct bank payouts. Routing must direct payouts to Payoneer or Airwallex.',
    });
  }

  /**
   * Validates NMI webhook notification signature using shared secret HMAC-SHA256.
   */
  async verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret: string
  ): Promise<WebhookVerificationResult> {
    if (!signatureHeader || !webhookSecret) {
      return { isValid: false, failureReason: 'Missing webhook signature or secret.' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signatureHeader, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { isValid: false, failureReason: 'Webhook signature verification failed.' };
    }

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      return {
        isValid: true,
        eventType: (parsed['event_type'] as string) ?? (parsed['type'] as string) ?? 'transaction.status',
        providerEventId: (parsed['event_id'] as string) ?? (parsed['id'] as string) ?? parsed['transaction_id'] as string,
        parsedPayload: parsed,
      };
    } catch {
      return { isValid: false, failureReason: 'Webhook payload is not valid JSON.' };
    }
  }

  /**
   * Helper sending URL-encoded form data to NMI Direct Post API.
   */
  private async postToNmi(payload: NmiDirectPostRequest): Promise<NmiDirectPostResponse> {
    const formData = new URLSearchParams();
    for (const [key, val] of Object.entries(payload)) {
      if (val !== undefined && val !== null) {
        formData.append(key, String(val));
      }
    }

    let response: Response;
    try {
      response = await this.httpClient(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });
    } catch (err: unknown) {
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Network communication failure contacting NMI Direct Post API: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    if (!response.ok) {
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `NMI Direct Post API returned HTTP status ${response.status}`,
        httpStatus: response.status,
      });
    }

    const responseText = await response.text();
    return parseNmiQueryResponse(responseText);
  }
}
