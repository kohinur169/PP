// path: lib/office/compliance-engine.ts

import crypto from 'node:crypto';
import { z } from 'zod';
import { Role, Permission, assertPermission, hasPermission } from '@/lib/auth/roles';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

/**
 * Underwriting review item for merchant onboarding.
 */
export interface UnderwritingReviewItem {
  readonly id: string;
  readonly companyId: string;
  readonly legalName: string;
  readonly dbaName: string;
  readonly businessType: string;
  readonly registrationNumber: string;
  readonly country: string;
  readonly mcc: string;
  readonly submittedDocuments: readonly string[];
  readonly sanctionsScreeningResult: 'CLEARED' | 'PEP_ALERT' | 'SANCTION_MATCH';
  uboVerified: boolean;
  recommendedRiskTier: 1 | 2 | 3;
  status: 'pending_review' | 'escalated_to_ceo' | 'rejected';
  officerNotes?: string | undefined;
  escalatedAt?: string | undefined;
}

/**
 * High-value or high-risk flagged transaction for manual compliance review.
 */
export interface ManualPaymentReviewItem {
  readonly id: string;
  readonly chargeId: string;
  readonly companyId: string;
  readonly merchantName: string;
  readonly amountUsd: number;
  readonly flagReason: 'AMOUNT_EXCEEDS_5K' | 'AVS_MISMATCH' | 'GEO_VELOCITY';
  readonly customerEmail: string;
  readonly processor: 'nmi' | 'payoneer' | 'rainforest' | 'stripe_connect' | 'airwallex';
  status: 'pending_review' | 'released' | 'cancelled_fraud';
  decisionAt?: string | undefined;
  decisionBy?: string | undefined;
  decisionNotes?: string | undefined;
}

/**
 * Confidential Suspicious Activity Report (SAR) workspace case.
 * Legally confidential under BSA/AML: strictly isolated from non-compliance roles.
 */
export interface SarCase {
  readonly id: string;
  readonly caseNumber: string;
  readonly companyId: string;
  readonly subjectName: string;
  readonly suspectedActivity:
    | 'STRUCTURING'
    | 'TERROR_FINANCING'
    | 'MONEY_LAUNDERING'
    | 'IDENTITY_THEFT'
    | 'SANCTIONS_EVASION';
  readonly narrative: string;
  readonly totalSuspiciousAmountUsd: number;
  fincenFilingStatus: 'draft' | 'ready_for_filing' | 'filed_with_fincen';
  readonly preparedBy: string;
  readonly preparedAt: string;
  readonly isConfidential: true;
}

// In-memory registries for compliance operations
const underwritingRegistry = new Map<string, UnderwritingReviewItem>();
const paymentReviewRegistry = new Map<string, ManualPaymentReviewItem>();
const sarRegistry = new Map<string, SarCase>();

/**
 * Resets stores for test isolation.
 */
export function resetComplianceDataForTest(): void {
  underwritingRegistry.clear();
  paymentReviewRegistry.clear();
  sarRegistry.clear();
}

/**
 * Seeds an underwriting item for testing.
 */
export function seedUnderwritingItemForTest(item: UnderwritingReviewItem): void {
  underwritingRegistry.set(item.id, { ...item });
}

/**
 * Seeds a flagged payment review item for testing.
 */
export function seedFlaggedPaymentForTest(item: ManualPaymentReviewItem): void {
  paymentReviewRegistry.set(item.id, { ...item });
}

/**
 * Seeds a SAR case for testing.
 */
export function seedSarCaseForTest(sar: SarCase): void {
  sarRegistry.set(sar.id, { ...sar });
}

/**
 * Step 068.2: Lists all merchant underwriting applications.
 */
export async function listUnderwritingReviews(actorRole: Role): Promise<UnderwritingReviewItem[]> {
  assertPermission(actorRole, Permission.REVIEW_KYC);
  return Array.from(underwritingRegistry.values());
}

/**
 * Step 068.2: Escalates an underwriting packet to CEO with compliance officer recommendation.
 */
export async function escalateUnderwritingToCeo(params: {
  readonly reviewId: string;
  readonly officerId: string;
  readonly officerRole: Role;
  readonly recommendedRiskTier: 1 | 2 | 3;
  readonly officerNotes: string;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<UnderwritingReviewItem> {
  const { reviewId, officerId, officerRole, recommendedRiskTier, officerNotes, auditRepo } = params;

  assertPermission(officerRole, Permission.REVIEW_KYC);

  const item = underwritingRegistry.get(reviewId);
  if (!item) {
    throw new Error(`Underwriting review "${reviewId}" not found.`);
  }

  if (item.status !== 'pending_review') {
    throw new Error(`Review "${reviewId}" is already ${item.status}.`);
  }

  item.status = 'escalated_to_ceo';
  item.recommendedRiskTier = recommendedRiskTier;
  item.officerNotes = officerNotes;
  item.uboVerified = true;
  item.escalatedAt = new Date().toISOString();

  underwritingRegistry.set(reviewId, item);

  logger.info('Merchant underwriting packet escalated to CEO for final approval', {
    reviewId,
    companyId: item.companyId,
    officerId,
    recommendedRiskTier,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: item.companyId,
      actor_id: officerId,
      action: 'KYC_STATUS_UPDATED',
      entity_type: 'kyc_underwriting',
      entity_id: reviewId,
      payload: {
        status: 'escalated_to_ceo',
        recommendedRiskTier,
        officerNotes,
      },
    });
  }

  return { ...item };
}

/**
 * Step 068.3: Lists flagged payments requiring manual compliance review (> $5k or AVS mismatch).
 */
export async function listFlaggedPayments(actorRole: Role): Promise<ManualPaymentReviewItem[]> {
  assertPermission(actorRole, Permission.MANUAL_PAYMENT_REVIEW);
  return Array.from(paymentReviewRegistry.values());
}

/**
 * Step 068.3: Resolves a manual payment review by either releasing funds or cancelling as fraud.
 */
export async function decidePaymentReview(params: {
  readonly paymentReviewId: string;
  readonly officerId: string;
  readonly officerRole: Role;
  readonly decision: 'release' | 'cancel_fraud';
  readonly notes: string;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<ManualPaymentReviewItem> {
  const { paymentReviewId, officerId, officerRole, decision, notes, auditRepo } = params;

  assertPermission(officerRole, Permission.MANUAL_PAYMENT_REVIEW);

  const item = paymentReviewRegistry.get(paymentReviewId);
  if (!item) {
    throw new Error(`Payment review "${paymentReviewId}" not found.`);
  }

  if (item.status !== 'pending_review') {
    throw new Error(`Payment review "${paymentReviewId}" already decided (status: ${item.status}).`);
  }

  const decisionTimestamp = new Date().toISOString();
  item.status = decision === 'release' ? 'released' : 'cancelled_fraud';
  item.decisionAt = decisionTimestamp;
  item.decisionBy = officerId;
  item.decisionNotes = notes;

  paymentReviewRegistry.set(paymentReviewId, item);

  logger.info('Manual payment review decided by compliance officer', {
    paymentReviewId,
    chargeId: item.chargeId,
    decision,
    amountUsd: item.amountUsd,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: item.companyId,
      actor_id: officerId,
      action: 'TRANSACTION_REVIEW_DECIDED',
      entity_type: 'payment_charge',
      entity_id: item.chargeId,
      payload: {
        paymentReviewId,
        decision,
        amountUsd: item.amountUsd,
        flagReason: item.flagReason,
        notes,
      },
    });
  }

  return { ...item };
}

/**
 * Step 068.4: Lists confidential SAR workspace cases.
 * Strictly forbidden for non-compliance roles (e.g. Finance, Support, Blogger, Owner).
 */
export async function listSarCases(actorRole: Role): Promise<SarCase[]> {
  assertPermission(actorRole, Permission.VIEW_SAR);
  return Array.from(sarRegistry.values());
}

export const CreateSarCaseSchema = z.object({
  companyId: z.string().uuid('Company ID must be a valid UUID'),
  subjectName: z.string().min(2).max(255),
  suspectedActivity: z.enum([
    'STRUCTURING',
    'TERROR_FINANCING',
    'MONEY_LAUNDERING',
    'IDENTITY_THEFT',
    'SANCTIONS_EVASION',
  ]),
  narrative: z.string().min(10, 'SAR narrative must be at least 10 characters').max(5000),
  totalSuspiciousAmountUsd: z.number().positive(),
});

/**
 * Step 068.4: Drafts and creates a confidential Suspicious Activity Report (SAR).
 */
export async function createSarCase(params: {
  readonly companyId: string;
  readonly subjectName: string;
  readonly suspectedActivity:
    | 'STRUCTURING'
    | 'TERROR_FINANCING'
    | 'MONEY_LAUNDERING'
    | 'IDENTITY_THEFT'
    | 'SANCTIONS_EVASION';
  readonly narrative: string;
  readonly totalSuspiciousAmountUsd: number;
  readonly officerId: string;
  readonly officerRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<SarCase> {
  const {
    companyId,
    subjectName,
    suspectedActivity,
    narrative,
    totalSuspiciousAmountUsd,
    officerId,
    officerRole,
    auditRepo,
  } = params;

  assertPermission(officerRole, Permission.PREPARE_SAR);

  const validated = CreateSarCaseSchema.parse({
    companyId,
    subjectName,
    suspectedActivity,
    narrative,
    totalSuspiciousAmountUsd,
  });

  const sarId = `sar_${crypto.randomUUID()}`;
  const caseNumber = `SAR-2026-${String(sarRegistry.size + 1).padStart(4, '0')}`;

  const sarCase: SarCase = {
    id: sarId,
    caseNumber,
    companyId: validated.companyId,
    subjectName: validated.subjectName,
    suspectedActivity: validated.suspectedActivity,
    narrative: validated.narrative,
    totalSuspiciousAmountUsd: validated.totalSuspiciousAmountUsd,
    fincenFilingStatus: 'draft',
    preparedBy: officerId,
    preparedAt: new Date().toISOString(),
    isConfidential: true,
  };

  sarRegistry.set(sarId, sarCase);

  logger.warn('Confidential SAR case prepared by compliance officer', {
    sarId,
    caseNumber,
    companyId: validated.companyId,
    activity: validated.suspectedActivity,
    officerId,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: validated.companyId,
      actor_id: officerId,
      action: 'SANCTIONS_SCREENING_COMPLETED',
      entity_type: 'sar_case',
      entity_id: sarId,
      payload: {
        caseNumber,
        suspectedActivity: validated.suspectedActivity,
        fincenStatus: 'draft',
        isConfidential: true,
      },
    });
  }

  return { ...sarCase };
}

/**
 * Updates FinCEN filing status of a SAR case.
 */
export async function updateSarFilingStatus(params: {
  readonly sarId: string;
  readonly status: 'draft' | 'ready_for_filing' | 'filed_with_fincen';
  readonly officerId: string;
  readonly officerRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<SarCase> {
  const { sarId, status, officerId, officerRole, auditRepo } = params;

  assertPermission(officerRole, Permission.PREPARE_SAR);

  const sarCase = sarRegistry.get(sarId);
  if (!sarCase) {
    throw new Error(`SAR case "${sarId}" not found.`);
  }

  sarCase.fincenFilingStatus = status;
  sarRegistry.set(sarId, sarCase);

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: sarCase.companyId,
      actor_id: officerId,
      action: 'SANCTIONS_SCREENING_COMPLETED',
      entity_type: 'sar_case',
      entity_id: sarId,
      payload: {
        fincenFilingStatus: status,
      },
    });
  }

  return { ...sarCase };
}
