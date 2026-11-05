// path: lib/payment/pre-capture-review.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { voidAuthorization, getAuthorizationRecord } from '@/lib/payment/auth-capture';
import type { PaymentProcessorSlug } from '@/types/processors';

/**
 * Mandatory compliance threshold: Any transaction strictly over USD 5,000.0000
 * requires documented manual review before capture, regardless of tier.
 */
export const PRE_CAPTURE_REVIEW_THRESHOLD_USD = Money.from('5000.0000');

/**
 * Authorized roles permitted to review and approve/reject pre-capture gates.
 * Explicitly: compliance_kyc owns the review, CEO performs required final approval,
 * and super_admin retains full authority. Support has no review authority.
 */
export const ALLOWED_PRE_CAPTURE_REVIEWER_ROLES = [
  'compliance_kyc',
  'ceo',
  'super_admin',
] as const;

export type PreCaptureReviewerRole =
  (typeof ALLOWED_PRE_CAPTURE_REVIEWER_ROLES)[number];

export type PreCaptureReviewStatus = 'pending' | 'approved' | 'rejected';

export interface PreCaptureReviewRecord {
  id: string;
  tenantId: string;
  companyId: string;
  paymentId: string;
  amount: Money;
  currency: 'USD';
  provider: PaymentProcessorSlug;
  status: PreCaptureReviewStatus;
  reviewerId?: string | undefined;
  reviewerRole?: PreCaptureReviewerRole | undefined;
  justification?: string | undefined;
  rejectionReason?: string | undefined;
  reviewedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface InitiatePreCaptureReviewRequest {
  tenantId: string;
  companyId: string;
  paymentId: string;
  amount: Money;
  provider: PaymentProcessorSlug;
}

export interface ApprovePreCaptureReviewRequest {
  paymentId: string;
  reviewerId: string;
  reviewerRole: string;
  justification: string;
  ipAddress?: string | undefined;
}

export interface RejectPreCaptureReviewRequest {
  paymentId: string;
  reviewerId: string;
  reviewerRole: string;
  rejectionReason: string;
  ipAddress?: string | undefined;
}

export class PreCaptureComplianceReviewRequiredError extends Error {
  public readonly code = 'PRE_CAPTURE_COMPLIANCE_REVIEW_REQUIRED';
  public readonly statusCode = 422;

  constructor(message: string) {
    super(message);
    this.name = 'PreCaptureComplianceReviewRequiredError';
  }
}

export class SingleStepChargeOverThresholdForbiddenError extends Error {
  public readonly code = 'SINGLE_STEP_CHARGE_OVER_THRESHOLD_FORBIDDEN';
  public readonly statusCode = 422;

  constructor(message: string) {
    super(message);
    this.name = 'SingleStepChargeOverThresholdForbiddenError';
  }
}

export class UnauthorizedReviewerRoleError extends Error {
  public readonly code = 'UNAUTHORIZED_REVIEWER_ROLE';
  public readonly statusCode = 403;

  constructor(role: string) {
    super(
      `Role '${role}' is not authorized to approve or reject pre-capture reviews. Allowed roles: ${ALLOWED_PRE_CAPTURE_REVIEWER_ROLES.join(', ')}.`
    );
    this.name = 'UnauthorizedReviewerRoleError';
  }
}

// In-memory store for high-performance retrieval and testing
const preCaptureReviewStore = new Map<string, PreCaptureReviewRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Checks if a transaction amount strictly exceeds the USD $5,000 threshold.
 */
export function isPreCaptureReviewRequired(amount: Money): boolean {
  return amount.greaterThan(PRE_CAPTURE_REVIEW_THRESHOLD_USD);
}

/**
 * Step 139.1: Enqueues a payment over $5,000 for mandatory manual compliance review.
 */
export async function initiatePreCaptureReview(
  request: InitiatePreCaptureReviewRequest
): Promise<PreCaptureReviewRecord> {
  const existing = preCaptureReviewStore.get(request.paymentId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: PreCaptureReviewRecord = {
    id,
    tenantId: request.tenantId,
    companyId: request.companyId,
    paymentId: request.paymentId,
    amount: request.amount,
    currency: 'USD',
    provider: request.provider,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  preCaptureReviewStore.set(request.paymentId, record);

  logger.warn('Payment flagged for mandatory pre-capture compliance review (>$5,000)', {
    reviewId: id,
    paymentId: request.paymentId,
    companyId: request.companyId,
    amount: request.amount.toNumericString(),
    provider: request.provider,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'PAYMENT_PRE_CAPTURE_REVIEW_INITIATED',
      entity_type: 'pre_capture_review',
      entity_id: id,
      payload: {
        paymentId: request.paymentId,
        companyId: request.companyId,
        amount: request.amount.toNumericString(),
        threshold: PRE_CAPTURE_REVIEW_THRESHOLD_USD.toNumericString(),
        provider: request.provider,
        status: 'pending',
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for pre-capture review initiation', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Retrieves the pre-capture review record associated with a payment ID.
 */
export async function getPreCaptureReview(
  paymentId: string
): Promise<PreCaptureReviewRecord | null> {
  return preCaptureReviewStore.get(paymentId) ?? null;
}

/**
 * Step 139.2: Approves pre-capture compliance review after documented manual verification.
 */
export async function approvePreCaptureReview(
  request: ApprovePreCaptureReviewRequest
): Promise<PreCaptureReviewRecord> {
  if (
    !ALLOWED_PRE_CAPTURE_REVIEWER_ROLES.includes(
      request.reviewerRole as PreCaptureReviewerRole
    )
  ) {
    throw new UnauthorizedReviewerRoleError(request.reviewerRole);
  }

  if (!request.justification || request.justification.trim().length < 10) {
    throw new Error(
      'Documented compliance justification is mandatory (minimum 10 characters required).'
    );
  }

  const review = preCaptureReviewStore.get(request.paymentId);
  if (!review) {
    throw new Error(`No pre-capture review found for paymentId '${request.paymentId}'.`);
  }

  if (review.status === 'approved') {
    return review;
  }

  if (review.status === 'rejected') {
    throw new Error('Cannot approve a pre-capture review that has already been rejected.');
  }

  const now = new Date().toISOString();
  review.status = 'approved';
  review.reviewerId = request.reviewerId;
  review.reviewerRole = request.reviewerRole as PreCaptureReviewerRole;
  review.justification = request.justification.trim();
  review.reviewedAt = now;
  review.updatedAt = now;

  logger.info('Pre-capture compliance review approved by compliance officer', {
    reviewId: review.id,
    paymentId: review.paymentId,
    reviewerId: request.reviewerId,
    reviewerRole: request.reviewerRole,
    amount: review.amount.toNumericString(),
  });

  try {
    await auditRepo.append({
      actor_id: request.reviewerId,
      action: 'PAYMENT_PRE_CAPTURE_REVIEW_APPROVED',
      entity_type: 'pre_capture_review',
      entity_id: review.id,
      payload: {
        paymentId: review.paymentId,
        companyId: review.companyId,
        amount: review.amount.toNumericString(),
        reviewerRole: request.reviewerRole,
        justification: review.justification,
        ipAddress: request.ipAddress ?? null,
        status: 'approved',
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for pre-capture review approval', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return review;
}

/**
 * Step 139.3: Rejects pre-capture compliance review, auto-voids authorization hold, and records audit trail.
 */
export async function rejectPreCaptureReview(
  request: RejectPreCaptureReviewRequest
): Promise<PreCaptureReviewRecord> {
  if (
    !ALLOWED_PRE_CAPTURE_REVIEWER_ROLES.includes(
      request.reviewerRole as PreCaptureReviewerRole
    )
  ) {
    throw new UnauthorizedReviewerRoleError(request.reviewerRole);
  }

  if (!request.rejectionReason || request.rejectionReason.trim().length < 5) {
    throw new Error('A detailed rejection reason is required.');
  }

  const review = preCaptureReviewStore.get(request.paymentId);
  if (!review) {
    throw new Error(`No pre-capture review found for paymentId '${request.paymentId}'.`);
  }

  if (review.status === 'rejected') {
    return review;
  }

  const now = new Date().toISOString();
  review.status = 'rejected';
  review.reviewerId = request.reviewerId;
  review.reviewerRole = request.reviewerRole as PreCaptureReviewerRole;
  review.rejectionReason = request.rejectionReason.trim();
  review.reviewedAt = now;
  review.updatedAt = now;

  // Auto-void the authorization hold so merchant never settles and hold is released
  const authRecord = await getAuthorizationRecord(request.paymentId);
  if (authRecord && authRecord.status === 'authorized') {
    await voidAuthorization({
      paymentId: request.paymentId,
      reason: `Pre-capture compliance review rejected: ${request.rejectionReason.trim()}`,
    });
  }

  logger.warn('Pre-capture compliance review rejected by compliance officer', {
    reviewId: review.id,
    paymentId: review.paymentId,
    reviewerId: request.reviewerId,
    reviewerRole: request.reviewerRole,
    reason: review.rejectionReason,
  });

  try {
    await auditRepo.append({
      actor_id: request.reviewerId,
      action: 'PAYMENT_PRE_CAPTURE_REVIEW_REJECTED',
      entity_type: 'pre_capture_review',
      entity_id: review.id,
      payload: {
        paymentId: review.paymentId,
        companyId: review.companyId,
        amount: review.amount.toNumericString(),
        reviewerRole: request.reviewerRole,
        rejectionReason: review.rejectionReason,
        ipAddress: request.ipAddress ?? null,
        status: 'rejected',
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for pre-capture review rejection', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return review;
}

/**
 * Step 139.4: Pre-capture Gate Assertion.
 * Evaluates whether capture can proceed for the given payment and amount.
 * Throws PreCaptureComplianceReviewRequiredError if transaction > $5,000 has not been approved.
 */
export async function assertCaptureAllowed(
  paymentId: string,
  amount: Money
): Promise<void> {
  if (!isPreCaptureReviewRequired(amount)) {
    return; // Transaction <= $5,000 does not trigger the mandatory pre-capture gate
  }

  const review = await getPreCaptureReview(paymentId);
  if (!review) {
    throw new PreCaptureComplianceReviewRequiredError(
      `Transaction over USD 5,000 ($${amount.toNumericString()}) requires a documented manual compliance review before capture. No review record found.`
    );
  }

  if (review.status === 'rejected') {
    throw new PreCaptureComplianceReviewRequiredError(
      `Capture blocked: Pre-capture compliance review was rejected with reason: '${review.rejectionReason}'.`
    );
  }

  if (review.status !== 'approved') {
    throw new PreCaptureComplianceReviewRequiredError(
      `Capture blocked: Transaction over USD 5,000 ($${amount.toNumericString()}) is pending compliance review approval. Review status: '${review.status}'.`
    );
  }
}

/**
 * Step 139.5: Gate for processors that do not support separate Auth & Capture.
 * "If a provider cannot safely separate authorization from capture, review must occur before
 * submitting a charge or the transaction is rejected; never charge first and review afterward."
 */
export function assertSingleStepChargeAllowed(
  amount: Money,
  providerSupportsSeparateAuth: boolean,
  isPreApproved: boolean
): void {
  if (!isPreCaptureReviewRequired(amount)) {
    return;
  }

  if (!providerSupportsSeparateAuth && !isPreApproved) {
    throw new SingleStepChargeOverThresholdForbiddenError(
      `Single-step charge over USD 5,000 ($${amount.toNumericString()}) is rejected: provider cannot safely separate authorization from capture, and transaction was not pre-approved. Never charge first and review afterward.`
    );
  }
}

/**
 * Resets the in-memory pre-capture review store for test isolation.
 */
export function resetPreCaptureReviewStore(): void {
  preCaptureReviewStore.clear();
}
