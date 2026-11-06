// path: lib/idv/mock.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import type {
  IdvAdapter,
  IdvProvider,
  IdvInitiateSessionRequest,
  IdvInitiateSessionResponse,
  IdvVerificationResult,
  IdvVerificationStatus,
} from './types';

export class MockIdvAdapter implements IdvAdapter {
  readonly vendor: IdvProvider = 'mock';

  private configuredStatus: IdvVerificationStatus = 'PASSED';
  private configuredConfidence: number = 0.98;
  private configuredLiveness: boolean = true;
  private configuredRejectionReasons: string[] = [];

  /**
   * Configures deterministic test outcome for subsequent mock verification inquiries.
   */
  public setMockOutcome(options: {
    status?: IdvVerificationStatus | undefined;
    confidence?: number | undefined;
    livenessPassed?: boolean | undefined;
    rejectionReasons?: string[] | undefined;
  }): void {
    if (options.status !== undefined) this.configuredStatus = options.status;
    if (options.confidence !== undefined) this.configuredConfidence = options.confidence;
    if (options.livenessPassed !== undefined) this.configuredLiveness = options.livenessPassed;
    if (options.rejectionReasons !== undefined)
      this.configuredRejectionReasons = options.rejectionReasons;
  }

  public async initiateVerificationSession(
    request: IdvInitiateSessionRequest
  ): Promise<IdvInitiateSessionResponse> {
    const sessionId = generateUuidV7();
    const vendorReference = `mock_ref_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return {
      sessionId,
      vendor: this.vendor,
      clientToken: `mock_tok_${sessionId.substring(0, 8)}`,
      redirectUrl: `https://idv.mock.kdsolution.it/verify?session=${sessionId}&user=${request.userId}`,
      vendorReference,
      expiresAt,
    };
  }

  public async checkVerificationStatus(
    vendorReference: string
  ): Promise<IdvVerificationResult> {
    return {
      sessionId: `sess_${vendorReference}`,
      vendor: this.vendor,
      status: this.configuredStatus,
      idType: 'PASSPORT',
      idNumberMasked: 'USA*****4321',
      fullName: 'Johnathan Edward Doe',
      dob: '1988-06-15',
      nationality: 'US',
      livenessPassed: this.configuredLiveness,
      confidenceScore: this.configuredConfidence,
      extractedAddress: {
        street: '100 Broadway Suite 500',
        city: 'New York',
        postalCode: '10005',
        country: 'US',
      },
      rejectionReasons:
        this.configuredRejectionReasons.length > 0
          ? this.configuredRejectionReasons
          : undefined,
      rawVendorStatus: `MOCK_${this.configuredStatus}`,
      completedAt: new Date().toISOString(),
    };
  }

  public verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string
  ): boolean {
    if (!signatureHeader || !secret) return false;

    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    if (computed.length !== signatureHeader.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(signatureHeader, 'utf8')
    );
  }

  public parseWebhookPayload(
    rawPayload: Record<string, unknown> | string
  ): IdvVerificationResult {
    const data =
      typeof rawPayload === 'string'
        ? (JSON.parse(rawPayload) as Record<string, unknown>)
        : rawPayload;

    const status = (data['status'] as IdvVerificationStatus) ?? this.configuredStatus;
    const confidence =
      typeof data['confidence'] === 'number'
        ? data['confidence']
        : this.configuredConfidence;
    const liveness =
      typeof data['livenessPassed'] === 'boolean'
        ? data['livenessPassed']
        : this.configuredLiveness;

    return {
      sessionId: (data['sessionId'] as string) ?? generateUuidV7(),
      vendor: this.vendor,
      status,
      idType: 'PASSPORT',
      idNumberMasked: (data['idNumberMasked'] as string) ?? 'USA*****4321',
      fullName: (data['fullName'] as string) ?? 'Johnathan Edward Doe',
      dob: '1988-06-15',
      nationality: 'US',
      livenessPassed: liveness,
      confidenceScore: confidence,
      rawVendorStatus: (data['rawStatus'] as string) ?? `MOCK_${status}`,
      completedAt: new Date().toISOString(),
    };
  }
}
