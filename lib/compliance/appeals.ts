// path: lib/compliance/appeals.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';

export type AdverseDecisionType =
  | 'ONBOARDING_REJECTION'
  | 'RISK_TIER_OVERRIDE'
  | 'GATEWAY_VELOCITY_HOLD'
  | 'ACCOUNT_SUSPENSION'
  | 'CHARGEBACK_DISPUTE_LIMIT';

export interface AppealSubmissionInput {
  companyId: string;
  merchantLegalName: string;
  contactEmail: string;
  decisionReferenceId: string;
  decisionType: AdverseDecisionType;
  adverseDecisionDate: string;
  groundsForAppeal: string;
  supplementalEvidenceUrls?: string[];
  clientIp: string;
}

export interface AppealSubmissionResult {
  appealId: string;
  decisionReferenceId: string;
  merchantLegalName: string;
  status: 'SUBMITTED_PENDING_REVIEW' | 'REJECTED_EXPIRED_WINDOW';
  submittedAt: string;
  slaDeterminationDeadline: string;
  rejectionReason?: string;
  digitalFingerprint: string;
}

/**
 * Computes a target date N business days in the future, skipping Saturday and Sunday.
 */
export function addBusinessDays(startDate: Date, businessDaysToAdd: number): Date {
  const result = new Date(startDate.getTime());
  let added = 0;
  while (added < businessDaysToAdd) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

/**
 * Validates and registers an adverse automated decision appeal.
 * Enforces the 14-day window and establishes a 5-business-day Compliance SLA.
 */
export function submitAdverseDecisionAppeal(
  input: AppealSubmissionInput,
  now: Date = new Date()
): AppealSubmissionResult {
  const appealId = generateUuidV7();
  const submittedAt = now.toISOString();

  const decisionDate = new Date(input.adverseDecisionDate);
  const diffDays = (now.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24);

  // Enforce 14-day window
  if (diffDays > 14) {
    const errorPayload = JSON.stringify({
      appealId,
      status: 'REJECTED_EXPIRED_WINDOW',
      submittedAt,
      input,
    });
    const digitalFingerprint = crypto.createHash('sha256').update(errorPayload).digest('hex');

    return {
      appealId,
      decisionReferenceId: input.decisionReferenceId,
      merchantLegalName: input.merchantLegalName,
      status: 'REJECTED_EXPIRED_WINDOW',
      submittedAt,
      slaDeterminationDeadline: submittedAt,
      rejectionReason:
        'Appeal window expired: Under platform governance rules, appeals must be submitted within fourteen (14) calendar days of adverse decision notice.',
      digitalFingerprint,
    };
  }

  // 5 Business Days SLA
  const slaDeadlineDate = addBusinessDays(now, 5);
  const slaDeterminationDeadline = slaDeadlineDate.toISOString();

  const canonicalPayload = JSON.stringify({
    appealId,
    companyId: input.companyId,
    merchantLegalName: input.merchantLegalName,
    contactEmail: input.contactEmail,
    decisionReferenceId: input.decisionReferenceId,
    decisionType: input.decisionType,
    adverseDecisionDate: input.adverseDecisionDate,
    groundsForAppeal: input.groundsForAppeal,
    supplementalEvidenceUrls: input.supplementalEvidenceUrls ?? [],
    clientIp: input.clientIp,
    submittedAt,
    slaDeterminationDeadline,
  });

  const digitalFingerprint = crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  return {
    appealId,
    decisionReferenceId: input.decisionReferenceId,
    merchantLegalName: input.merchantLegalName,
    status: 'SUBMITTED_PENDING_REVIEW',
    submittedAt,
    slaDeterminationDeadline,
    digitalFingerprint,
  };
}
