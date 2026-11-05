// path: lib/compliance/review.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger';

export type KycRiskLevel = 'standard' | 'high_risk' | 'elevated_volume';

export type KycReviewDecision = 'approved' | 'rejected' | 'info_requested';

export type KycReviewOverallStatus =
  | 'pending_first_review'
  | 'pending_second_review'
  | 'ready_for_ceo_approval'
  | 'rejected'
  | 'info_requested';

export interface KycReviewCase {
  id: string;
  tenantId: string;
  companyId: string;
  riskLevel: KycRiskLevel;
  requiresFourEyes: boolean;
  firstReviewerId?: string | undefined;
  firstReviewedAt?: string | undefined;
  firstReviewerDecision?: KycReviewDecision | undefined;
  firstReviewerNotes?: string | undefined;
  secondReviewerId?: string | undefined;
  secondReviewedAt?: string | undefined;
  secondReviewerDecision?: KycReviewDecision | undefined;
  secondReviewerNotes?: string | undefined;
  overallStatus: KycReviewOverallStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Creates a KYC/KYB review case for an onboarding merchant application.
 * Automatically flags four-eye requirement if high_risk or elevated_volume.
 */
export function createKycReviewCase(params: {
  tenantId: string;
  companyId: string;
  riskLevel: KycRiskLevel;
  requiresFourEyes?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
}): KycReviewCase {
  const now = new Date().toISOString();
  const id = generateUuidV7();

  const requiresFourEyes =
    params.requiresFourEyes !== undefined
      ? params.requiresFourEyes
      : params.riskLevel === 'high_risk' || params.riskLevel === 'elevated_volume';

  logger.info('KYC compliance review case created', {
    caseId: id,
    companyId: params.companyId,
    riskLevel: params.riskLevel,
    requiresFourEyes,
  });

  return {
    id,
    tenantId: params.tenantId,
    companyId: params.companyId,
    riskLevel: params.riskLevel,
    requiresFourEyes,
    overallStatus: 'pending_first_review',
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Submits the first compliance reviewer's decision.
 */
export function submitFirstReviewerDecision(params: {
  reviewCase: KycReviewCase;
  reviewerId: string;
  decision: KycReviewDecision;
  notes: string;
}): KycReviewCase {
  if (params.reviewCase.overallStatus !== 'pending_first_review') {
    throw new Error(
      `Cannot submit first review: Case is in status '${params.reviewCase.overallStatus}'. Expected 'pending_first_review'.`
    );
  }

  if (!params.notes || params.notes.trim().length < 10) {
    throw new Error('Compliance review notes must be at least 10 characters.');
  }

  const now = new Date().toISOString();
  let nextStatus: KycReviewOverallStatus;

  if (params.decision === 'rejected') {
    nextStatus = 'rejected';
  } else if (params.decision === 'info_requested') {
    nextStatus = 'info_requested';
  } else {
    // Approved
    nextStatus = params.reviewCase.requiresFourEyes
      ? 'pending_second_review'
      : 'ready_for_ceo_approval';
  }

  logger.info('First compliance review recorded', {
    caseId: params.reviewCase.id,
    reviewerId: params.reviewerId,
    decision: params.decision,
    nextStatus,
  });

  return {
    ...params.reviewCase,
    firstReviewerId: params.reviewerId,
    firstReviewedAt: now,
    firstReviewerDecision: params.decision,
    firstReviewerNotes: params.notes.trim(),
    overallStatus: nextStatus,
    updatedAt: now,
  };
}

/**
 * Submits the second compliance reviewer's decision for high-risk / four-eye applications.
 * Enforces business rule: firstReviewerId !== secondReviewerId.
 */
export function submitSecondReviewerDecision(params: {
  reviewCase: KycReviewCase;
  reviewerId: string;
  decision: KycReviewDecision;
  notes: string;
}): KycReviewCase {
  if (params.reviewCase.overallStatus !== 'pending_second_review') {
    throw new Error(
      `Cannot submit second review: Case is in status '${params.reviewCase.overallStatus}'. Expected 'pending_second_review'.`
    );
  }

  if (!params.reviewCase.requiresFourEyes) {
    throw new Error('This application does not require a second reviewer sign-off.');
  }

  // Four-Eye Rule Enforcement
  if (params.reviewCase.firstReviewerId === params.reviewerId) {
    throw new Error(
      'Four-Eye Compliance Rule Violation: The second reviewer must be a distinct compliance officer from the first reviewer.'
    );
  }

  if (!params.notes || params.notes.trim().length < 10) {
    throw new Error('Second compliance review notes must be at least 10 characters.');
  }

  const now = new Date().toISOString();
  let nextStatus: KycReviewOverallStatus;

  if (params.decision === 'rejected') {
    nextStatus = 'rejected';
  } else if (params.decision === 'info_requested') {
    nextStatus = 'info_requested';
  } else {
    // Approved
    nextStatus = 'ready_for_ceo_approval';
  }

  logger.info('Second compliance review recorded (four-eye gate passed)', {
    caseId: params.reviewCase.id,
    firstReviewerId: params.reviewCase.firstReviewerId,
    secondReviewerId: params.reviewerId,
    decision: params.decision,
    nextStatus,
  });

  return {
    ...params.reviewCase,
    secondReviewerId: params.reviewerId,
    secondReviewedAt: now,
    secondReviewerDecision: params.decision,
    secondReviewerNotes: params.notes.trim(),
    overallStatus: nextStatus,
    updatedAt: now,
  };
}

/**
 * Checks whether the application has collected all required compliance sign-offs
 * and is cleared to advance to the CEO Executive Approval queue.
 */
export function canAdvanceToCeoApproval(reviewCase: KycReviewCase): boolean {
  if (reviewCase.overallStatus !== 'ready_for_ceo_approval') {
    return false;
  }

  if (reviewCase.firstReviewerDecision !== 'approved') {
    return false;
  }

  if (reviewCase.requiresFourEyes) {
    if (
      !reviewCase.secondReviewerId ||
      reviewCase.secondReviewerDecision !== 'approved' ||
      reviewCase.firstReviewerId === reviewCase.secondReviewerId
    ) {
      return false;
    }
  }

  return true;
}
