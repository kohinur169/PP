// path: lib/compliance/privacy.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';

export type DataSubjectRequestType =
  | 'ACCESS'
  | 'ERASURE'
  | 'RECTIFICATION'
  | 'PORTABILITY'
  | 'RESTRICTION';

export type PrivacyJurisdiction =
  | 'GDPR_EU'
  | 'GDPR_UK'
  | 'CCPA_CALIFORNIA'
  | 'OTHER';

export interface DsrSubmissionInput {
  requesterEmail: string;
  requesterFullName: string;
  requestType: DataSubjectRequestType;
  jurisdiction: PrivacyJurisdiction;
  clientIp: string;
  requestDetails?: string;
}

export interface DsrRecord {
  requestId: string;
  requesterEmail: string;
  requesterFullName: string;
  requestType: DataSubjectRequestType;
  jurisdiction: PrivacyJurisdiction;
  submittedAt: string;
  responseDeadline: string;
  digitalFingerprint: string;
}

export interface RetentionExemptionEvaluation {
  canEraseImmediately: boolean;
  statutoryRetentionYears: number;
  legalBasisExemption: string;
  policyConclusion: string;
}

/**
 * Registers an official Data Subject Request (DSR) with a 30-day response SLA and cryptographic signature.
 */
export function submitDataSubjectRequest(input: DsrSubmissionInput): DsrRecord {
  const requestId = generateUuidV7();
  const submittedDate = new Date();
  const deadlineDate = new Date(submittedDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const canonicalPayload = JSON.stringify({
    requestId,
    requesterEmail: input.requesterEmail,
    requesterFullName: input.requesterFullName,
    requestType: input.requestType,
    jurisdiction: input.jurisdiction,
    submittedAt: submittedDate.toISOString(),
    responseDeadline: deadlineDate.toISOString(),
    clientIp: input.clientIp,
    details: input.requestDetails ?? '',
  });

  const digitalFingerprint = crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  return {
    requestId,
    requesterEmail: input.requesterEmail,
    requesterFullName: input.requesterFullName,
    requestType: input.requestType,
    jurisdiction: input.jurisdiction,
    submittedAt: submittedDate.toISOString(),
    responseDeadline: deadlineDate.toISOString(),
    digitalFingerprint,
  };
}

/**
 * Evaluates whether an erasure request can be fulfilled immediately or is restricted by statutory financial/AML retention rules.
 */
export function evaluateDataRetentionExemption(input: {
  requestType: DataSubjectRequestType;
  hasFinancialTransactions: boolean;
}): RetentionExemptionEvaluation {
  if (input.requestType === 'ERASURE' && input.hasFinancialTransactions) {
    return {
      canEraseImmediately: false,
      statutoryRetentionYears: 7,
      legalBasisExemption: 'GDPR Article 17(3)(b) & FinCEN BSA 31 CFR Chapter X Statutory Obligation',
      policyConclusion:
        'Financial transaction records, double-entry ledger journals, tax documents, and KYC/KYB identity dossiers cannot be erased due to mandatory seven (7) year statutory retention laws. Marketing profiles and non-essential logs are marked for immediate deletion.',
    };
  }

  return {
    canEraseImmediately: true,
    statutoryRetentionYears: 0,
    legalBasisExemption: 'N/A',
    policyConclusion:
      'No statutory financial retention conflict detected. Personal data will be fully purged or anonymized within the thirty (30) day compliance SLA.',
  };
}
