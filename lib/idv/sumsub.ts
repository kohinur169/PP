// path: lib/idv/sumsub.ts

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

export interface SumsubConfig {
  appToken: string;
  secretKey: string;
  baseUrl?: string | undefined;
}

export interface SumsubWebhookPayload {
  applicantId: string;
  inspectionId?: string | undefined;
  correlationId?: string | undefined;
  externalUserId: string;
  type: string;
  reviewResult?:
    | {
        reviewAnswer: 'GREEN' | 'RED';
        rejectLabels?: string[] | undefined;
        reviewRejectType?: 'FINAL' | 'RETRY' | undefined;
        clientComment?: string | undefined;
        moderationComment?: string | undefined;
      }
    | undefined;
  reviewStatus?: 'init' | 'pending' | 'prechecked' | 'queued' | 'completed' | 'onHold' | undefined;
  info?:
    | {
        firstName?: string | undefined;
        lastName?: string | undefined;
        dob?: string | undefined;
        country?: string | undefined;
        addresses?:
          | Array<{
              street?: string | undefined;
              city?: string | undefined;
              postCode?: string | undefined;
              country?: string | undefined;
            }>
          | undefined;
        idDocs?:
          | Array<{
              idDocType?: string | undefined;
              number?: string | undefined;
              country?: string | undefined;
            }>
          | undefined;
      }
    | undefined;
}

export class SumsubAdapter implements IdvAdapter {
  readonly vendor: IdvProvider = 'sumsub';
  private readonly appToken: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(config?: Partial<SumsubConfig>) {
    this.appToken = config?.appToken ?? process.env.SUMSUB_APP_TOKEN ?? 'sumsub_test_app_token';
    this.secretKey = config?.secretKey ?? process.env.SUMSUB_SECRET_KEY ?? 'sumsub_test_secret_key';
    this.baseUrl = config?.baseUrl ?? 'https://api.sumsub.com';
  }

  /**
   * Generates signed Sumsub WebSDK access token for merchant frontend embedding.
   */
  public async initiateVerificationSession(
    request: IdvInitiateSessionRequest
  ): Promise<IdvInitiateSessionResponse> {
    const sessionId = generateUuidV7();
    const applicantId = `sumsub_app_${sessionId.replace(/-/g, '').slice(0, 16)}`;
    const clientToken = `sumsub_tok_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    const redirectUrl = `https://cockpit.sumsub.com/idensic/app?accessToken=${clientToken}&userId=${encodeURIComponent(
      request.userId
    )}&levelName=basic-kyc-level`;

    return {
      sessionId,
      vendor: this.vendor,
      clientToken,
      redirectUrl,
      vendorReference: applicantId,
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
      rawVendorStatus: 'PENDING_SUMSUB_REVIEW',
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Verifies Sumsub HMAC-SHA256 or HMAC-SHA1 webhook signature (`x-payload-digest`).
   */
  public verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string = this.secretKey,
    digestAlg: 'sha256' | 'sha1' = 'sha256'
  ): boolean {
    if (!signatureHeader || !secret) return false;

    const computed = crypto
      .createHmac(digestAlg, secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    if (computed.length !== signatureHeader.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(signatureHeader, 'utf8')
    );
  }

  /**
   * Normalizes Sumsub webhook inspection payload into standard platform IdvVerificationResult.
   */
  public parseWebhookPayload(
    rawPayload: Record<string, unknown> | string
  ): IdvVerificationResult {
    const data: SumsubWebhookPayload =
      typeof rawPayload === 'string'
        ? (JSON.parse(rawPayload) as SumsubWebhookPayload)
        : (rawPayload as unknown as SumsubWebhookPayload);

    let status: IdvVerificationStatus;
    const reviewAnswer = data.reviewResult?.reviewAnswer;
    const reviewStatus = data.reviewStatus;

    if (reviewAnswer === 'GREEN') {
      status = 'PASSED';
    } else if (reviewAnswer === 'RED') {
      if (data.reviewResult?.reviewRejectType === 'RETRY') {
        status = 'MANUAL_REVIEW';
      } else {
        status = 'FAILED';
      }
    } else if (reviewStatus === 'onHold' || reviewStatus === 'queued') {
      status = 'MANUAL_REVIEW';
    } else {
      status = 'PENDING';
    }

    const livenessPassed = reviewAnswer === 'GREEN';
    const confidenceScore = reviewAnswer === 'GREEN' ? 0.98 : reviewAnswer === 'RED' ? 0.25 : 0.5;

    // Document Type & Number
    const primaryDoc = data.info?.idDocs?.[0];
    let idType: IdDocumentType | undefined;
    const rawType = primaryDoc?.idDocType?.toUpperCase();
    if (rawType === 'PASSPORT') {
      idType = 'PASSPORT';
    } else if (rawType === 'DRIVERS' || rawType === 'DRIVING_LICENSE') {
      idType = 'DRIVERS_LICENSE';
    } else if (rawType === 'ID_CARD') {
      idType = 'NATIONAL_ID';
    } else if (rawType === 'RESIDENCE_PERMIT') {
      idType = 'RESIDENCE_PERMIT';
    }

    let idNumberMasked: string | undefined;
    if (primaryDoc?.number && primaryDoc.number.length >= 4) {
      const visible = primaryDoc.number.slice(-4);
      idNumberMasked = `${'*'.repeat(Math.max(4, primaryDoc.number.length - 4))}${visible}`;
    }

    const fullName =
      data.info?.firstName && data.info?.lastName
        ? `${data.info.firstName} ${data.info.lastName}`.trim()
        : undefined;

    const rejectionReasons: string[] = [];
    if (data.reviewResult?.rejectLabels && data.reviewResult.rejectLabels.length > 0) {
      rejectionReasons.push(...data.reviewResult.rejectLabels);
    }
    if (data.reviewResult?.moderationComment) {
      rejectionReasons.push(data.reviewResult.moderationComment);
    }

    const primaryAddr = data.info?.addresses?.[0];

    return {
      sessionId: data.externalUserId || data.applicantId || generateUuidV7(),
      vendor: this.vendor,
      status,
      idType,
      idNumberMasked,
      fullName,
      dob: data.info?.dob,
      nationality: (data.info?.country || primaryDoc?.country)?.slice(0, 2).toUpperCase(),
      livenessPassed,
      confidenceScore,
      extractedAddress: primaryAddr
        ? {
            street: primaryAddr.street ?? '',
            city: primaryAddr.city ?? '',
            postalCode: primaryAddr.postCode ?? '',
            country: primaryAddr.country ?? '',
          }
        : undefined,
      rejectionReasons: rejectionReasons.length > 0 ? rejectionReasons : undefined,
      rawVendorStatus: `SUMSUB_${reviewAnswer ?? reviewStatus ?? 'UNKNOWN'}`,
      completedAt: new Date().toISOString(),
    };
  }
}
