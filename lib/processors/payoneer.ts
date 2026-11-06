// path: lib/processors/payoneer.ts

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
  GatewayInvalidRequestError,
  GatewayNetworkError,
} from '@/lib/processors/types';

export const DEFAULT_PAYONEER_BASE_URL = 'https://api.sandbox.payoneer.com/v4';

export interface PayoneerAdapterConfig {
  programId: string;
  clientId: string;
  clientSecret: string;
  baseUrl?: string | undefined;
  httpClient?: typeof fetch | undefined;
}

export interface PayoneerBankDetails {
  bankName: string;
  accountNumber: string;
  routingNumber?: string | undefined;
  swiftBic?: string | undefined;
  accountHolderName: string;
  countryCode: string;
  currency: 'USD';
}

export interface PayoneerPayeeRegistrationResult {
  payeeId: string;
  status: 'active' | 'pending';
  bankAccountId: string;
}

export interface PayoneerWebhookEvent {
  event_type: 'payout.submitted' | 'payout.completed' | 'payout.failed' | 'payout.cancelled';
  payout_id: string;
  client_reference_id: string;
  amount: string;
  currency: 'USD';
  status: 'SUBMITTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  failure_reason?: string | undefined;
  timestamp: string;
}

/**
 * Official Payoneer Global Mass Payouts Adapter.
 * Connects to Payoneer Mass Payouts REST API v4 using OAuth2 client credentials.
 * Handles automatic registration of merchant payout bank accounts and disbursement of settlement payouts in USD.
 */
export class PayoneerAdapter implements PaymentProcessorAdapter {
  readonly providerSlug = 'payoneer';
  readonly providerDisplayName = 'Payoneer Mass Payouts';

  private readonly programId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly httpClient: typeof fetch;

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: PayoneerAdapterConfig) {
    if (!config.programId || !config.clientId || !config.clientSecret) {
      throw new GatewayAuthError({
        provider: this.providerSlug,
        message: 'Payoneer programId, clientId, and clientSecret are strictly required.',
      });
    }
    this.programId = config.programId;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.baseUrl = config.baseUrl ?? DEFAULT_PAYONEER_BASE_URL;
    this.httpClient = config.httpClient ?? fetch;
  }

  /**
   * Acquires or caches an OAuth2 bearer token from Payoneer.
   */
  async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
    }

    if (this.clientId.includes('mock') || this.baseUrl.startsWith('mock://')) {
      this.cachedAccessToken = `mock_payoneer_token_${generateUuidV7().slice(0, 8)}`;
      this.tokenExpiresAt = Date.now() + 3600 * 1000;
      return this.cachedAccessToken;
    }

    try {
      const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const response = await this.httpClient(`${this.baseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=read write',
      });

      if (!response.ok) {
        throw new GatewayAuthError({
          provider: this.providerSlug,
          message: `Payoneer OAuth authentication failed with status ${response.status}`,
          httpStatus: response.status,
        });
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };
      this.cachedAccessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
      return this.cachedAccessToken;
    } catch (err: unknown) {
      if (err instanceof GatewayAuthError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Failed to acquire Payoneer OAuth token: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Tests API connectivity and OAuth authentication against Payoneer gateway.
   */
  async testConnection(): Promise<GatewayConnectionTestResult> {
    const startTime = Date.now();
    try {
      const token = await this.getAccessToken();
      const latencyMs = Date.now() - startTime;
      return {
        isConnected: Boolean(token),
        latencyMs,
        environment: this.baseUrl.includes('sandbox') ? 'sandbox' : 'production',
        apiVersion: 'v4 Mass Payouts',
        message: 'Payoneer Mass Payouts API authenticated successfully.',
      };
    } catch (err: unknown) {
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Payoneer connection test failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Payoneer does not operate as an embedded card processor for sub-merchants.
   * Direct card acceptance is handled by NMI, Rainforest, or Stripe.
   */
  async createSubMerchant(request: CreateSubMerchantRequest): Promise<SubMerchantResult> {
    return {
      success: true,
      providerSubmerchantId: `payoneer_payee_${request.companyId.replace(/-/g, '').slice(0, 12)}`,
      status: 'active',
      capabilities: {
        card_payments: false,
        transfers: true,
        payouts: true,
      },
      rawProviderResponse: {
        program_id: this.programId,
      },
    };
  }

  async authorizePayment(_request: AuthorizeRequest): Promise<ChargeResult> {
    throw new GatewayInvalidRequestError({
      provider: this.providerSlug,
      message: 'Payoneer adapter is dedicated to mass settlement payouts; card authorization is unsupported.',
    });
  }

  async capturePayment(_request: CaptureRequest): Promise<ChargeResult> {
    throw new GatewayInvalidRequestError({
      provider: this.providerSlug,
      message: 'Payoneer adapter is dedicated to mass settlement payouts; capture is unsupported.',
    });
  }

  async refundPayment(_request: RefundRequest): Promise<RefundResult> {
    throw new GatewayInvalidRequestError({
      provider: this.providerSlug,
      message: 'Payoneer adapter is dedicated to mass settlement payouts; refund is unsupported.',
    });
  }

  /**
   * Registers a payee and bank account with Payoneer Mass Payouts API.
   */
  async registerPayoutBank(
    companyId: string,
    bank: PayoneerBankDetails
  ): Promise<PayoneerPayeeRegistrationResult> {
    const token = await this.getAccessToken();
    const payeeId = `payee_${companyId.replace(/-/g, '').slice(0, 16)}`;

    if (this.baseUrl.startsWith('mock://') || this.clientId.includes('mock')) {
      return {
        payeeId,
        status: 'active',
        bankAccountId: `bank_${generateUuidV7().slice(0, 8)}`,
      };
    }

    try {
      const response = await this.httpClient(
        `${this.baseUrl}/programs/${this.programId}/payees/${payeeId}/bank-accounts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bank_name: bank.bankName,
            account_number: bank.accountNumber,
            routing_number: bank.routingNumber,
            swift_bic: bank.swiftBic,
            account_holder_name: bank.accountHolderName,
            country: bank.countryCode,
            currency: 'USD',
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Payoneer payee registration failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { bank_account_id?: string; status?: string };
      return {
        payeeId,
        status: (resData.status as 'active') ?? 'active',
        bankAccountId: resData.bank_account_id ?? `bank_${generateUuidV7().slice(0, 8)}`,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Failed to register payee bank account with Payoneer: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Disburses an approved settlement payout in USD via Payoneer Mass Payouts API.
   */
  async createPayout(request: PayoutRequest): Promise<PayoutResult> {
    if (request.amount.lessThanOrEqual(0)) {
      throw new GatewayInvalidRequestError({
        provider: this.providerSlug,
        message: 'Payout amount must be greater than zero.',
      });
    }

    const token = await this.getAccessToken();
    const clientReferenceId = request.idempotencyKey || generateUuidV7();
    const payeeId = `payee_${request.companyId.replace(/-/g, '').slice(0, 16)}`;

    if (this.baseUrl.startsWith('mock://') || this.clientId.includes('mock')) {
      const payoutId = `po_payo_${generateUuidV7().replace(/-/g, '').slice(0, 12)}`;
      return {
        success: true,
        payoutId,
        amount: request.amount,
        status: 'in_transit',
        arrivalDateEstimate: new Date(Date.now() + 86400000 * 1).toISOString().split('T')[0],
        rawProviderResponse: {
          client_reference_id: clientReferenceId,
          payee_id: payeeId,
          status: 'SUBMITTED',
        },
      };
    }

    try {
      const response = await this.httpClient(
        `${this.baseUrl}/programs/${this.programId}/payouts`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_reference_id: clientReferenceId,
            payee_id: payeeId,
            amount: Number(request.amount.toDisplayString(false)),
            currency: 'USD',
            description: request.description ?? 'Merchant Settlement Payout',
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new GatewayInvalidRequestError({
          provider: this.providerSlug,
          message: `Payoneer payout dispatch failed: ${errText}`,
        });
      }

      const resData = (await response.json()) as { payout_id?: string; status?: string };
      const payoutId = resData.payout_id ?? `po_payo_${generateUuidV7().replace(/-/g, '').slice(0, 12)}`;

      return {
        success: true,
        payoutId,
        amount: request.amount,
        status: resData.status === 'COMPLETED' ? 'paid' : 'in_transit',
        arrivalDateEstimate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        rawProviderResponse: resData,
      };
    } catch (err: unknown) {
      if (err instanceof GatewayInvalidRequestError) throw err;
      throw new GatewayNetworkError({
        provider: this.providerSlug,
        message: `Failed to execute Payoneer payout: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /**
   * Validates Payoneer HMAC-SHA256 webhook notification signature.
   */
  async verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    webhookSecret: string
  ): Promise<WebhookVerificationResult> {
    if (!signatureHeader || !webhookSecret) {
      return { isValid: false, failureReason: 'Missing Payoneer webhook signature or secret.' };
    }

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const sigBuffer = Buffer.from(signatureHeader, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { isValid: false, failureReason: 'Payoneer webhook signature mismatch.' };
    }

    try {
      const parsed = JSON.parse(rawBody) as PayoneerWebhookEvent;
      return {
        isValid: true,
        eventType: parsed.event_type ?? `payout.${(parsed.status ?? 'unknown').toLowerCase()}`,
        providerEventId: parsed.payout_id ?? parsed.client_reference_id,
        parsedPayload: parsed as unknown as Record<string, unknown>,
      };
    } catch {
      return { isValid: false, failureReason: 'Malformed Payoneer webhook JSON.' };
    }
  }
}
