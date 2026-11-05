// path: lib/idv/didit.ts

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

export interface DiditConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string | undefined;
  requestTimeoutMs?: number | undefined;
}

export interface DiditWebhookPayload {
  session_id: string;
  vendor_reference?: string | undefined;
  user_id: string;
  status: 'APPROVED' | 'DECLINED' | 'RESUBMISSION_REQUESTED' | 'REVIEW_NEEDED';
  timestamp: string; // ISO or epoch
  liveness: {
    passed: boolean;
    confidence: number; // 0 to 100
  };
  ocr_document?: {
    document_type?: string | undefined; // 'PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID'
    document_number?: string | undefined;
    first_name?: string | undefined;
    last_name?: string | undefined;
    date_of_birth?: string | undefined; // YYYY-MM-DD
    issuing_country?: string | undefined; // ISO 2-letter
    address?: {
      street?: string | undefined;
      city?: string | undefined;
      postal_code?: string | undefined;
      country?: string | undefined;
    } | undefined;
  } | undefined;
  decision_reasons?: string[] | undefined;
}

export class DiditAdapter implements IdvAdapter {
  readonly vendor: IdvProvider = 'didit';
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(config?: Partial<DiditConfig>) {
    this.apiKey = config?.apiKey ?? process.env.DIDIT_API_KEY ?? 'didit_test_key';
    this.apiSecret = config?.apiSecret ?? process.env.DIDIT_API_SECRET ?? 'didit_test_secret';
    this.baseUrl = config?.baseUrl ?? 'https://api.didit.me/v1';
    this.requestTimeoutMs = config?.requestTimeoutMs ?? 8000;
  }

  public async initiateVerificationSession(
    request: IdvInitiateSessionRequest
  ): Promise<IdvInitiateSessionResponse> {
    const sessionId = generateUuidV7();
    const vendorReference = `didit_sess_${sessionId}`;
    const clientToken = `didit_tok_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString(); // 45 minutes

    const redirectUrl = `https://verify.didit.me/session/${vendorReference}?token=${clientToken}&user=${encodeURIComponent(
      request.userId
    )}&return_url=${encodeURIComponent(
      request.redirectUrl ?? 'https://kdsolution.it/onboarding/kyc/complete'
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
    return {
      sessionId: `sess_${vendorReference}`,
      vendor: this.vendor,
      status: 'PENDING',
      livenessPassed: false,
      confidenceScore: 0.0,
      rawVendorStatus: 'PENDING_DIDIT_CAPTURE',
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Verifies Didit HMAC-SHA256 signature and guards against replay attacks by inspecting timestamp.
   */
  public verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string = this.apiSecret,
    timestampHeader?: string | undefined,
    referenceDate: Date = new Date()
  ): boolean {
    if (!signatureHeader || !secret) return false;

    // Check replay attack timestamp if provided (must be within 5 minutes)
    if (timestampHeader) {
      const ts = parseInt(timestampHeader, 10);
      if (!isNaN(ts)) {
        const eventTime = ts > 1e11 ? ts : ts * 1000;
        const maxAgeMs = 5 * 60 * 1000; // 5 minutes
        if (Math.abs(referenceDate.getTime() - eventTime) > maxAgeMs) {
          return false; // Timestamp is expired or from the distant future
        }
      }
    }

    const payloadToSign = timestampHeader ? `${timestampHeader}.${rawBody}` : rawBody;

    const computed = crypto
      .createHmac('sha256', secret)
      .update(payloadToSign, 'utf8')
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
    const data: DiditWebhookPayload =
      typeof rawPayload === 'string'
        ? (JSON.parse(rawPayload) as DiditWebhookPayload)
        : (rawPayload as unknown as DiditWebhookPayload);

    // Map Didit statuses
    let status: IdvVerificationStatus;
    switch (data.status) {
      case 'APPROVED':
        status = 'PASSED';
        break;
      case 'RESUBMISSION_REQUESTED':
      case 'REVIEW_NEEDED':
        status = 'MANUAL_REVIEW';
        break;
      case 'DECLINED':
      default:
        status = 'FAILED';
        break;
    }

    const livenessPassed = Boolean(data.liveness?.passed);
    const rawConfidence = data.liveness?.confidence ?? (status === 'PASSED' ? 95 : 30);
    const confidenceScore = Math.min(1.0, Math.max(0.0, rawConfidence / 100));

    // OCR Document Type Mapping
    let idType: IdDocumentType | undefined;
    const rawType = data.ocr_document?.document_type?.toUpperCase();
    if (rawType === 'PASSPORT') {
      idType = 'PASSPORT';
    } else if (rawType === 'DRIVERS_LICENSE' || rawType === 'DRIVING_LICENSE') {
      idType = 'DRIVERS_LICENSE';
    } else if (rawType === 'NATIONAL_ID' || rawType === 'ID_CARD') {
      idType = 'NATIONAL_ID';
    } else if (rawType === 'RESIDENCE_PERMIT') {
      idType = 'RESIDENCE_PERMIT';
    }

    // Mask Document Number
    const rawDocNum = data.ocr_document?.document_number;
    let idNumberMasked: string | undefined;
    if (rawDocNum && rawDocNum.length >= 4) {
      const visible = rawDocNum.slice(-4);
      idNumberMasked = `${'*'.repeat(Math.max(4, rawDocNum.length - 4))}${visible}`;
    }

    const fullName =
      data.ocr_document?.first_name && data.ocr_document?.last_name
        ? `${data.ocr_document.first_name} ${data.ocr_document.last_name}`.trim()
        : undefined;

    return {
      sessionId: data.session_id || data.user_id || generateUuidV7(),
      vendor: this.vendor,
      status,
      idType,
      idNumberMasked,
      fullName,
      dob: data.ocr_document?.date_of_birth,
      nationality: data.ocr_document?.issuing_country?.slice(0, 2).toUpperCase(),
      livenessPassed,
      confidenceScore,
      extractedAddress: data.ocr_document?.address
        ? {
            street: data.ocr_document.address.street ?? '',
            city: data.ocr_document.address.city ?? '',
            postalCode: data.ocr_document.address.postal_code ?? '',
            country: data.ocr_document.address.country ?? '',
          }
        : undefined,
      rejectionReasons: data.decision_reasons,
      rawVendorStatus: `DIDIT_${data.status}`,
      completedAt: data.timestamp || new Date().toISOString(),
    };
  }
}
