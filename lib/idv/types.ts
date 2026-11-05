// path: lib/idv/types.ts

export type IdvProvider = 'jumio' | 'didit' | 'sumsub' | 'mock';

export type IdvVerificationStatus =
  | 'PASSED'
  | 'FAILED'
  | 'MANUAL_REVIEW'
  | 'EXPIRED'
  | 'PENDING';

export type IdDocumentType =
  | 'PASSPORT'
  | 'DRIVERS_LICENSE'
  | 'NATIONAL_ID'
  | 'RESIDENCE_PERMIT';

export interface IdvInitiateSessionRequest {
  userId: string;
  companyId: string;
  userEmail: string;
  userFullName: string;
  redirectUrl?: string | undefined;
  callbackUrl?: string | undefined;
  locale?: string | undefined;
}

export interface IdvInitiateSessionResponse {
  sessionId: string;
  vendor: IdvProvider;
  clientToken?: string | undefined;
  redirectUrl: string;
  vendorReference: string;
  expiresAt: string;
}

export interface IdvVerificationResult {
  sessionId: string;
  vendor: IdvProvider;
  status: IdvVerificationStatus;
  idType?: IdDocumentType | undefined;
  idNumberMasked?: string | undefined;
  fullName?: string | undefined;
  dob?: string | undefined;
  nationality?: string | undefined;
  livenessPassed: boolean;
  confidenceScore: number; // 0.00 to 1.00
  extractedAddress?:
    | {
        street: string;
        city: string;
        postalCode: string;
        country: string;
      }
    | undefined;
  rejectionReasons?: string[] | undefined;
  rawVendorStatus: string;
  completedAt: string;
}

export interface IdvEnforcementDecision {
  isApproved: boolean;
  requiresManualReview: boolean;
  isRejected: boolean;
  reasons: string[];
  finalStatus: IdvVerificationStatus;
}

/**
 * Enforces the platform Fail-Closed security policy:
 * - NEVER auto-pass if confidence < 0.80.
 * - NEVER auto-pass if biometric liveness check failed.
 * - If status is not explicitly 'PASSED', must route to MANUAL_REVIEW or REJECTED.
 */
export function applyIdvFailClosedPolicy(
  result: IdvVerificationResult
): IdvEnforcementDecision {
  const reasons: string[] = [];

  if (result.status === 'FAILED') {
    return {
      isApproved: false,
      requiresManualReview: false,
      isRejected: true,
      reasons: result.rejectionReasons ?? ['IDV vendor determined verification failure.'],
      finalStatus: 'FAILED',
    };
  }

  if (result.status === 'EXPIRED') {
    return {
      isApproved: false,
      requiresManualReview: false,
      isRejected: true,
      reasons: ['Identity verification session expired prior to completion.'],
      finalStatus: 'EXPIRED',
    };
  }

  if (result.status === 'PENDING') {
    return {
      isApproved: false,
      requiresManualReview: false,
      isRejected: false,
      reasons: ['Verification session is actively in progress.'],
      finalStatus: 'PENDING',
    };
  }

  // Strict Fail-Closed Integrity Guards
  if (!result.livenessPassed) {
    reasons.push('Biometric facial liveness detection failed or unconfirmed.');
  }

  if (result.confidenceScore < 0.8) {
    reasons.push(
      `IDV vendor confidence score (${(result.confidenceScore * 100).toFixed(1)}%) is below the mandatory 80.0% threshold.`
    );
  }

  if (result.status === 'MANUAL_REVIEW' || reasons.length > 0) {
    return {
      isApproved: false,
      requiresManualReview: true,
      isRejected: false,
      reasons:
        reasons.length > 0
          ? reasons
          : result.rejectionReasons ?? ['Flagged by IDV provider for manual inspection.'],
      finalStatus: 'MANUAL_REVIEW',
    };
  }

  return {
    isApproved: true,
    requiresManualReview: false,
    isRejected: false,
    reasons: [],
    finalStatus: 'PASSED',
  };
}

/**
 * Standard Supplementary IDV Vendor Adapter Interface.
 * Only ONE supplementary vendor can be actively selected at any given time.
 */
export interface IdvAdapter {
  readonly vendor: IdvProvider;

  initiateVerificationSession(
    request: IdvInitiateSessionRequest
  ): Promise<IdvInitiateSessionResponse>;

  checkVerificationStatus(
    vendorReference: string
  ): Promise<IdvVerificationResult>;

  verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string
  ): boolean;

  parseWebhookPayload(
    rawPayload: Record<string, unknown> | string
  ): IdvVerificationResult;
}
