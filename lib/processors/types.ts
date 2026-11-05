// path: lib/processors/types.ts

import { Money } from '@/lib/money/money';

// ============================================================================
// Standardized Gateway Error Classes
// ============================================================================

export interface GatewayErrorParams {
  provider: string;
  code: string;
  message: string;
  declineCode?: string | undefined;
  rawMessage?: string | undefined;
  httpStatus?: number | undefined;
}

export class GatewayError extends Error {
  readonly provider: string;
  readonly code: string;
  readonly declineCode?: string | undefined;
  readonly rawMessage?: string | undefined;
  readonly httpStatus: number;

  constructor(params: GatewayErrorParams) {
    super(`[${params.provider.toUpperCase()} Gateway Error] ${params.message} (code: ${params.code})`);
    this.name = 'GatewayError';
    this.provider = params.provider;
    this.code = params.code;
    this.declineCode = params.declineCode;
    this.rawMessage = params.rawMessage;
    this.httpStatus = params.httpStatus ?? 400;
  }
}

export class GatewayDeclinedError extends GatewayError {
  constructor(params: Omit<GatewayErrorParams, 'code'> & { code?: string | undefined }) {
    super({
      ...params,
      code: params.code ?? 'CARD_DECLINED',
      httpStatus: 402, // Payment Required
    });
    this.name = 'GatewayDeclinedError';
  }
}

export class GatewayNetworkError extends GatewayError {
  constructor(params: Omit<GatewayErrorParams, 'code'> & { code?: string | undefined }) {
    super({
      ...params,
      code: params.code ?? 'GATEWAY_TIMEOUT',
      httpStatus: 504, // Gateway Timeout
    });
    this.name = 'GatewayNetworkError';
  }
}

export class GatewayAuthError extends GatewayError {
  constructor(params: Omit<GatewayErrorParams, 'code'> & { code?: string | undefined }) {
    super({
      ...params,
      code: params.code ?? 'AUTHENTICATION_FAILED',
      httpStatus: 401, // Unauthorized
    });
    this.name = 'GatewayAuthError';
  }
}

export class GatewayInvalidRequestError extends GatewayError {
  constructor(params: Omit<GatewayErrorParams, 'code'> & { code?: string | undefined }) {
    super({
      ...params,
      code: params.code ?? 'INVALID_REQUEST',
      httpStatus: 400, // Bad Request
    });
    this.name = 'GatewayInvalidRequestError';
  }
}

// ============================================================================
// Payment Processing Request and Response Types
// ============================================================================

export interface AuthorizeRequest {
  companyId: string;
  submerchantId?: string | undefined;
  amount: Money;
  currency: 'USD';
  paymentMethodToken: string;
  idempotencyKey: string;
  orderId?: string | undefined;
  customerEmail?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ChargeResult {
  success: boolean;
  transactionId: string;
  status: 'authorized' | 'captured' | 'failed';
  amount: Money;
  currency: 'USD';
  authorizationCode?: string | undefined;
  avsResultCode?: string | undefined;
  cvvResultCode?: string | undefined;
  declineReason?: string | undefined;
  rawProviderResponse?: Record<string, unknown> | undefined;
}

export interface CaptureRequest {
  companyId: string;
  submerchantId?: string | undefined;
  authorizationTransactionId: string;
  amount: Money;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface RefundRequest {
  companyId: string;
  submerchantId?: string | undefined;
  originalTransactionId: string;
  amount: Money;
  reason?: string | undefined;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  originalTransactionId: string;
  amount: Money;
  status: 'pending' | 'succeeded' | 'failed';
  failureReason?: string | undefined;
  rawProviderResponse?: Record<string, unknown> | undefined;
}

export interface PayoutRequest {
  companyId: string;
  submerchantId?: string | undefined;
  amount: Money;
  destinationBankAccountId: string;
  currency: 'USD';
  idempotencyKey: string;
  description?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface PayoutResult {
  success: boolean;
  payoutId: string;
  amount: Money;
  status: 'scheduled' | 'in_transit' | 'paid' | 'failed';
  arrivalDateEstimate?: string | undefined;
  failureReason?: string | undefined;
  rawProviderResponse?: Record<string, unknown> | undefined;
}

export interface CreateSubMerchantRequest {
  companyId: string;
  legalBusinessName: string;
  dbaName?: string | undefined;
  mccCode: string;
  taxId: string;
  representativeEmail: string;
  countryCode: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface SubMerchantResult {
  success: boolean;
  providerSubmerchantId: string;
  status: 'active' | 'provisioning' | 'restricted' | 'failed';
  capabilities: {
    card_payments: boolean;
    transfers: boolean;
    payouts: boolean;
  };
  rawProviderResponse?: Record<string, unknown> | undefined;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventType?: string | undefined;
  providerEventId?: string | undefined;
  parsedPayload?: Record<string, unknown> | undefined;
  failureReason?: string | undefined;
}

export interface GatewayConnectionTestResult {
  isConnected: boolean;
  latencyMs: number;
  environment: 'sandbox' | 'production';
  apiVersion?: string | undefined;
  message: string;
}

// ============================================================================
// Standardized Payment Processor Adapter Interface
// ============================================================================

export interface PaymentProcessorAdapter {
  readonly providerSlug: string;
  readonly providerDisplayName: string;

  /**
   * Pings the payment gateway API to verify connectivity and credential validity.
   */
  testConnection(credentials?: Record<string, string> | undefined): Promise<GatewayConnectionTestResult>;

  /**
   * Onboards or links a sub-merchant processing account with the processor.
   */
  createSubMerchant(request: CreateSubMerchantRequest): Promise<SubMerchantResult>;

  /**
   * Authorizes a credit card charge (two-step auth).
   */
  authorizePayment(request: AuthorizeRequest): Promise<ChargeResult>;

  /**
   * Captures a previously authorized charge.
   */
  capturePayment(request: CaptureRequest): Promise<ChargeResult>;

  /**
   * Issues a full or partial refund against an original captured charge.
   */
  refundPayment(request: RefundRequest): Promise<RefundResult>;

  /**
   * Dispatches a payout to a verified merchant bank account.
   */
  createPayout(request: PayoutRequest): Promise<PayoutResult>;

  /**
   * Cryptographically validates inbound webhook signatures (HMAC or RSA).
   */
  verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret: string
  ): Promise<WebhookVerificationResult>;
}
