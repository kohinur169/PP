// path: lib/idv/jumio.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import type {
  IdvAdapter,
  IdvProvider,
  IdvInitiateSessionRequest,
  IdvInitiateSessionResponse,
  IdvVerificationResult,
  IdvVerificationStatus,
  IdDocumentType,
} from './types';

export interface JumioConfig {
  apiToken: string;
  apiSecret: string;
  datacenter?: 'US' | 'EU' | 'SG' | undefined;
}

export interface JumioWebhookPayload {
  scanReference: string;
  customerInternalReference: string;
  verificationStatus: 'PASSED' | 'FAILED' | 'WARNING';
  transactionStatus: 'PASSED' | 'FAILED' | 'ERROR';
  idScanStatus: 'SUCCESS' | 'ERROR';
  livenessStatus?: 'PASSED' | 'FAILED' | 'NOT_PERFORMED' | undefined;
  similarityScore?: number | undefined;
  idCheck?: {
    status: 'PASSED' | 'FAILED' | 'WARNING';
    type?: string | undefined; // 'PASSPORT', 'DRIVING_LICENSE', 'ID_CARD'
    idNumber?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    dob?: string | undefined; // YYYY-MM-DD
    country?: string | undefined; // ISO 3-letter or 2-letter
    address?: {
      street?: string | undefined;
      city?: string | undefined;
      postalCode?: string | undefined;
      country?: string | undefined;
    } | undefined;
  } | undefined;
  rejectReason?: {
    ruleCode?: string | undefined;
    description?: string | undefined;
  } | undefined;
}

export class JumioAdapter implements IdvAdapter {
  readonly vendor: IdvProvider = 'jumio';
  private readonly apiToken: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;

  constructor(config?: Partial<JumioConfig>) {
    this.apiToken = config?.apiToken ?? process.env.JUMIO_API_TOKEN ?? 'jumio_test_token';
    this.apiSecret = config?.apiSecret ?? process.env.JUMIO_API_SECRET ?? 'jumio_test_secret';

    const dc = config?.datacenter ?? 'US';
    switch (dc) {
      case 'EU':
        this.baseUrl = 'https://netverify.eu.jumio.com/api/v4';
        break;
      case 'SG':
        this.baseUrl = 'https://netverify.sg.jumio.com/api/v4';
        break;
      case 'US':
      default:
        this.baseUrl = 'https://netverify.jumio.com/api/v4';
        break;
    }
  }

  public async initiateVerificationSession(
    request: IdvInitiateSessionRequest
  ): Promise<IdvInitiateSessionResponse> {
    const sessionId = generateUuidV7();
    const vendorReference = `jumio_scan_${sessionId}`;
    const clientToken = `jumio_tok_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    const redirectUrl = `https://netverify.jumio.com/web/v4/app?authorizationToken=${clientToken}&customerInternalReference=${encodeURIComponent(
      request.userId
    )}&callbackUrl=${encodeURIComponent(
      request.callbackUrl ?? 'https://kdsolution.it/api/webhooks/idv/jumio'
    )}`;

    return {
      sessionId,
      vendor: this.vendor,
      clientToken,
      redirectUrl,
      vendorReference,
      expiresAt,
    };
  }

  public async checkVerificationStatus(
    vendorReference: string
  ): Promise<IdvVerificationResult> {
    // Standard inquiry fallback representation
    return {
      sessionId: `sess_${vendorReference}`,
      vendor: this.vendor,
      status: 'PENDING',
      livenessPassed: false,
      confidenceScore: 0.0,
      rawVendorStatus: 'PENDING_SCAN',
      completedAt: new Date().toISOString(),
    };
  }

  public verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string = this.apiSecret
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
    const data: JumioWebhookPayload =
      typeof rawPayload === 'string'
        ? (JSON.parse(rawPayload) as JumioWebhookPayload)
        : (rawPayload as unknown as JumioWebhookPayload);

    // Map Jumio status codes
    let status: IdvVerificationStatus;
    if (data.verificationStatus === 'PASSED' && data.transactionStatus === 'PASSED') {
      status = 'PASSED';
    } else if (data.verificationStatus === 'WARNING') {
      status = 'MANUAL_REVIEW';
    } else {
      status = 'FAILED';
    }

    const livenessPassed = data.livenessStatus === 'PASSED';
    const confidenceScore =
      typeof data.similarityScore === 'number'
        ? Math.min(1.0, Math.max(0.0, data.similarityScore / 100))
        : status === 'PASSED'
        ? 0.95
        : 0.4;

    // Document Type Mapping
    let idType: IdDocumentType | undefined;
    const rawType = data.idCheck?.type?.toUpperCase();
    if (rawType === 'PASSPORT') {
      idType = 'PASSPORT';
    } else if (rawType === 'DRIVING_LICENSE' || rawType === 'DRIVERS_LICENSE') {
      idType = 'DRIVERS_LICENSE';
    } else if (rawType === 'ID_CARD') {
      idType = 'NATIONAL_ID';
    } else if (rawType === 'RESIDENCE_PERMIT') {
      idType = 'RESIDENCE_PERMIT';
    }

    // Mask Document Number
    const rawNumber = data.idCheck?.idNumber;
    let idNumberMasked: string | undefined;
    if (rawNumber && rawNumber.length >= 4) {
      const visible = rawNumber.slice(-4);
      idNumberMasked = `${'*'.repeat(Math.max(4, rawNumber.length - 4))}${visible}`;
    }

    const fullName =
      data.idCheck?.firstName && data.idCheck?.lastName
        ? `${data.idCheck.firstName} ${data.idCheck.lastName}`.trim()
        : undefined;

    const rejectionReasons: string[] = [];
    if (data.rejectReason?.description) {
      rejectionReasons.push(data.rejectReason.description);
    }
    if (status === 'MANUAL_REVIEW') {
      rejectionReasons.push('Flagged by Jumio Netverify warning check for manual visual review.');
    }

    return {
      sessionId: data.customerInternalReference || generateUuidV7(),
      vendor: this.vendor,
      status,
      idType,
      idNumberMasked,
      fullName,
      dob: data.idCheck?.dob,
      nationality: data.idCheck?.country?.slice(0, 2).toUpperCase(),
      livenessPassed,
      confidenceScore,
      extractedAddress: data.idCheck?.address
        ? {
            street: data.idCheck.address.street ?? '',
            city: data.idCheck.address.city ?? '',
            postalCode: data.idCheck.address.postalCode ?? '',
            country: data.idCheck.address.country ?? '',
          }
        : undefined,
      rejectionReasons: rejectionReasons.length > 0 ? rejectionReasons : undefined,
      rawVendorStatus: `${data.verificationStatus}_${data.transactionStatus}`,
      completedAt: new Date().toISOString(),
    };
  }
}
