// path: lib/compliance/pep.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger';
import { computeNameFuzzySimilarity } from '@/lib/kyb/bank-address';

export type PepTier = 1 | 2 | 3;

export type AdverseMediaCategory =
  | 'financial_crime'
  | 'fraud'
  | 'money_laundering'
  | 'corruption'
  | 'terrorist_financing'
  | 'sanctions_evasion'
  | 'tax_evasion';

export type PepCaseStatus =
  | 'pending_edd'
  | 'compliance_recommended'
  | 'ceo_approved'
  | 'rejected';

export interface KnownPepRecord {
  id: string;
  fullName: string;
  aliases: string[];
  pepTier: PepTier;
  pepPosition: string;
  country: string;
  adverseMediaFlag: boolean;
  adverseMediaCategories: AdverseMediaCategory[];
}

export interface PepScreeningEvaluation {
  isPepHit: boolean;
  pepTier?: PepTier | undefined;
  pepPosition?: string | undefined;
  hasAdverseMedia: boolean;
  adverseMediaCategories: AdverseMediaCategory[];
  matchedRecordId?: string | undefined;
  matchedName?: string | undefined;
  similarityScore: number;
  requiresEdd: boolean;
  reason?: string | undefined;
}

export interface PepScreeningCase {
  id: string;
  tenantId: string;
  companyId: string;
  individualName: string;
  role: 'ubo' | 'director' | 'authorized_signatory' | 'merchant_principal';
  pepTier?: PepTier | undefined;
  pepPosition?: string | undefined;
  adverseMediaFlag: boolean;
  adverseMediaCategories: AdverseMediaCategory[];
  status: PepCaseStatus;
  sourceOfWealth?: string | undefined;
  sourceOfFunds?: string | undefined;
  complianceRationale?: string | undefined;
  complianceOfficerId?: string | undefined;
  complianceRecommendedAt?: string | undefined;
  ceoApproverId?: string | undefined;
  ceoApprovedAt?: string | undefined;
  rejectionReason?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface PepEddRecommendationInput {
  caseRecord: PepScreeningCase;
  complianceOfficerId: string;
  sourceOfWealth: string;
  sourceOfFunds: string;
  complianceRationale: string;
}

export interface PepCeoApprovalInput {
  caseRecord: PepScreeningCase;
  ceoUserId: string;
  approvalNotes?: string | undefined;
}

export interface PepRejectionInput {
  caseRecord: PepScreeningCase;
  reviewerUserId: string;
  rejectionReason: string;
}

/**
 * Curated catalog of Politically Exposed Persons (PEPs) and individuals
 * flagged with serious adverse media for screening.
 */
export const KNOWN_PEP_CATALOG: KnownPepRecord[] = [
  {
    id: 'pep_001',
    fullName: 'Gabriel Santiago Moreno',
    aliases: ['Gabriel Moreno', 'G. Santiago Moreno'],
    pepTier: 1,
    pepPosition: 'Minister of Mines and Energy',
    country: 'CO',
    adverseMediaFlag: false,
    adverseMediaCategories: [],
  },
  {
    id: 'pep_002',
    fullName: 'Tariq Mansoor',
    aliases: ['General Tariq Mansoor', 'Tariq Al-Mansoor'],
    pepTier: 2,
    pepPosition: 'Major General, Central Procurement Command',
    country: 'PK',
    adverseMediaFlag: true,
    adverseMediaCategories: ['corruption'],
  },
  {
    id: 'pep_003',
    fullName: 'Elena Ivanova',
    aliases: ['Elena V. Ivanova'],
    pepTier: 3,
    pepPosition: 'Managing Director, Regional State Railway Enterprise',
    country: 'BG',
    adverseMediaFlag: true,
    adverseMediaCategories: ['fraud', 'financial_crime'],
  },
  {
    id: 'adv_001',
    fullName: 'Arthur Pendelton Sterling',
    aliases: ['Arthur Sterling', 'A. P. Sterling'],
    pepTier: 3,
    pepPosition: 'Private Financier / Former Municipal Advisor',
    country: 'UK',
    adverseMediaFlag: true,
    adverseMediaCategories: ['money_laundering', 'tax_evasion'],
  },
];

/**
 * Evaluates an individual against PEP registers and adverse media databases.
 */
export function evaluateIndividualForPepAndMedia(
  individualName: string,
  catalog: KnownPepRecord[] = KNOWN_PEP_CATALOG
): PepScreeningEvaluation {
  let highestScore = 0;
  let bestMatch: KnownPepRecord | undefined;
  let bestMatchedName: string | undefined;

  for (const entry of catalog) {
    const candidateNames = [entry.fullName, ...entry.aliases];
    for (const name of candidateNames) {
      const score = computeNameFuzzySimilarity(individualName, name);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = entry;
        bestMatchedName = name;
      }
    }
  }

  // Threshold: >= 0.85 similarity flags as PEP or Adverse Media hit
  if (highestScore >= 0.85 && bestMatch) {
    const isPepHit = bestMatch.pepTier !== undefined;
    const hasAdverseMedia = bestMatch.adverseMediaFlag;

    return {
      isPepHit,
      pepTier: bestMatch.pepTier,
      pepPosition: bestMatch.pepPosition,
      hasAdverseMedia,
      adverseMediaCategories: bestMatch.adverseMediaCategories,
      matchedRecordId: bestMatch.id,
      matchedName: bestMatchedName,
      similarityScore: highestScore,
      requiresEdd: true,
      reason: `High similarity (${(highestScore * 100).toFixed(1)}%) with ${
        isPepHit ? `Tier ${bestMatch.pepTier} PEP` : 'Adverse Media'
      } record: ${bestMatch.fullName} (${bestMatch.pepPosition})`,
    };
  }

  return {
    isPepHit: false,
    hasAdverseMedia: false,
    adverseMediaCategories: [],
    similarityScore: highestScore,
    requiresEdd: false,
  };
}

/**
 * Creates a formal PEP & Adverse Media screening case when a match is detected.
 */
export function createPepScreeningCase(params: {
  tenantId: string;
  companyId: string;
  individualName: string;
  role?: 'ubo' | 'director' | 'authorized_signatory' | 'merchant_principal' | undefined;
  evaluation: PepScreeningEvaluation;
}): PepScreeningCase {
  const now = new Date().toISOString();
  const caseId = generateUuidV7();

  return {
    id: caseId,
    tenantId: params.tenantId,
    companyId: params.companyId,
    individualName: params.individualName,
    role: params.role ?? 'ubo',
    pepTier: params.evaluation.pepTier,
    pepPosition: params.evaluation.pepPosition,
    adverseMediaFlag: params.evaluation.hasAdverseMedia,
    adverseMediaCategories: params.evaluation.adverseMediaCategories,
    status: 'pending_edd',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Compliance Officer submits Enhanced Due Diligence (EDD) documentation.
 * Enforces mandatory documentation of Source of Wealth, Source of Funds, and Compliance Rationale.
 * Moves status to 'compliance_recommended'.
 */
export function submitComplianceOfficerEddRecommendation(
  input: PepEddRecommendationInput
): PepScreeningCase {
  if (input.caseRecord.status !== 'pending_edd') {
    throw new Error(
      `Cannot submit EDD recommendation for case in status '${input.caseRecord.status}'. Must be 'pending_edd'.`
    );
  }

  if (!input.sourceOfWealth || input.sourceOfWealth.trim().length < 15) {
    throw new Error(
      'Enhanced Due Diligence (EDD) requires a comprehensive Source of Wealth explanation (minimum 15 characters).'
    );
  }

  if (!input.sourceOfFunds || input.sourceOfFunds.trim().length < 15) {
    throw new Error(
      'Enhanced Due Diligence (EDD) requires a comprehensive Source of Funds explanation (minimum 15 characters).'
    );
  }

  if (!input.complianceRationale || input.complianceRationale.trim().length < 20) {
    throw new Error(
      'Compliance Officer recommendation requires documented risk rationale (minimum 20 characters).'
    );
  }

  const now = new Date().toISOString();

  logger.info('PEP EDD compliance recommendation submitted', {
    caseId: input.caseRecord.id,
    companyId: input.caseRecord.companyId,
    complianceOfficerId: input.complianceOfficerId,
    pepTier: input.caseRecord.pepTier,
  });

  return {
    ...input.caseRecord,
    status: 'compliance_recommended',
    sourceOfWealth: input.sourceOfWealth.trim(),
    sourceOfFunds: input.sourceOfFunds.trim(),
    complianceRationale: input.complianceRationale.trim(),
    complianceOfficerId: input.complianceOfficerId,
    complianceRecommendedAt: now,
    updatedAt: now,
  };
}

/**
 * CEO Executive Approval (Dual Sign-Off).
 * Enforces that case must already have a documented Compliance Officer recommendation.
 * Moves status to 'ceo_approved', clearing the EDD activation hold.
 */
export function submitCeoExecutiveApproval(
  input: PepCeoApprovalInput
): PepScreeningCase {
  if (input.caseRecord.status !== 'compliance_recommended') {
    throw new Error(
      `Executive approval rejected: Case must be in 'compliance_recommended' status with documented EDD before CEO sign-off. Current status is '${input.caseRecord.status}'.`
    );
  }

  if (!input.caseRecord.complianceOfficerId || !input.caseRecord.complianceRationale) {
    throw new Error(
      'Executive approval rejected: Missing required Compliance Officer EDD documentation.'
    );
  }

  const now = new Date().toISOString();

  logger.info('PEP EDD CEO executive sign-off confirmed', {
    caseId: input.caseRecord.id,
    companyId: input.caseRecord.companyId,
    ceoUserId: input.ceoUserId,
    complianceOfficerId: input.caseRecord.complianceOfficerId,
  });

  return {
    ...input.caseRecord,
    status: 'ceo_approved',
    ceoApproverId: input.ceoUserId,
    ceoApprovedAt: now,
    updatedAt: now,
  };
}

/**
 * Formally rejects a PEP screening case due to unacceptable AML/CFT risk.
 */
export function rejectPepScreeningCase(
  input: PepRejectionInput
): PepScreeningCase {
  if (!input.rejectionReason || input.rejectionReason.trim().length < 10) {
    throw new Error('Case rejection requires documented rationale (minimum 10 characters).');
  }

  const now = new Date().toISOString();

  logger.warn('PEP EDD case rejected due to risk', {
    caseId: input.caseRecord.id,
    companyId: input.caseRecord.companyId,
    reviewerUserId: input.reviewerUserId,
    reason: input.rejectionReason,
  });

  return {
    ...input.caseRecord,
    status: 'rejected',
    rejectionReason: input.rejectionReason.trim(),
    updatedAt: now,
  };
}

/**
 * Checks whether merchant activation remains gated by open or rejected PEP/EDD cases.
 * Activation is strictly blocked if any case is pending EDD, waiting for CEO sign-off, or rejected.
 */
export function isMerchantPepActivationGated(cases: PepScreeningCase[]): {
  isBlocked: boolean;
  reason?: string | undefined;
} {
  const rejectedCase = cases.find((c) => c.status === 'rejected');
  if (rejectedCase) {
    return {
      isBlocked: true,
      reason: `Activation permanently blocked: PEP case ${rejectedCase.id} for '${rejectedCase.individualName}' was rejected by compliance.`,
    };
  }

  const pendingEdd = cases.find((c) => c.status === 'pending_edd');
  if (pendingEdd) {
    return {
      isBlocked: true,
      reason: `Activation blocked: Pending Enhanced Due Diligence (EDD) for '${pendingEdd.individualName}' (Tier ${pendingEdd.pepTier ?? 'N/A'}).`,
    };
  }

  const pendingCeo = cases.find((c) => c.status === 'compliance_recommended');
  if (pendingCeo) {
    return {
      isBlocked: true,
      reason: `Activation blocked: Awaiting required CEO Executive Sign-Off for '${pendingCeo.individualName}' following Compliance recommendation.`,
    };
  }

  return { isBlocked: false };
}
