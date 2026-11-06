// path: lib/compliance/sar.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger';
import { Role } from '@/lib/auth/roles';
import { Money } from '@/lib/money/money';

export type SarStatus = 'draft' | 'filed' | 'closed';

export type SuspiciousActivityCategory =
  | 'structuring'
  | 'money_laundering'
  | 'terrorist_financing'
  | 'fraud'
  | 'identity_theft'
  | 'insider_abuse'
  | 'bribery_corruption';

export interface SarSuspectDetails {
  fullName: string;
  role: string;
  ssnOrTaxIdMasked?: string | undefined;
  dateOfBirth?: string | undefined;
  physicalAddress?: string | undefined;
  knownIpAddresses: string[];
  associatedBankAccounts: string[];
}

export interface SarEvidencePack {
  transactionTimeline: Array<{
    transactionId: string;
    amountUsd: string;
    timestamp: string;
    chargebackReason?: string | undefined;
    isCardTestingPattern?: boolean | undefined;
  }>;
  ipAddresses: string[];
  deviceFingerprints: string[];
  kycDocumentIds: string[];
  flaggedAlertNotes: string[];
  compiledAt: string;
}

export interface SarCaseEntity {
  id: string;
  tenantId: string;
  companyId: string;
  caseNumber: string;
  fincenBsaIdentifier?: string | undefined;
  status: SarStatus;
  suspectDetails: SarSuspectDetails;
  suspiciousActivityCategories: SuspiciousActivityCategory[];
  narrative: string;
  evidencePack: SarEvidencePack;
  fictitiousTransactionCount: number;
  totalSuspiciousAmountUsd: string; // numeric(18, 4)
  filedByUserId?: string | undefined;
  filedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSarCaseInput {
  tenantId: string;
  companyId: string;
  actorRole: Role;
  actorUserId: string;
  suspectDetails: SarSuspectDetails;
  suspiciousActivityCategories: SuspiciousActivityCategory[];
  narrative: string;
  evidencePack: SarEvidencePack;
  totalSuspiciousAmountUsd: Money;
  fictitiousTransactionCount?: number | undefined;
}

export interface FileSarCaseInput {
  sarCase: SarCaseEntity;
  actorRole: Role;
  actorUserId: string;
  fincenBsaIdentifier: string;
}

export class UnauthorizedSarAccessError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedSarAccessError';
  }
}

/**
 * Asserts role authorization to prevent illegal BSA / FinCEN Anti-Tipping-Off breaches (31 U.S.C. § 5318(g)(2)).
 * Strictly restricts SAR access to 'compliance_kyc' and 'super_admin' roles.
 * Merchant owners and support staff receive 403 Forbidden.
 */
export function assertSarRoleAccess(actorRole: Role): void {
  const allowedRoles = [Role.COMPLIANCE_KYC, Role.SUPER_ADMIN];

  if (!allowedRoles.includes(actorRole)) {
    logger.warn('SECURITY ALERT: Illegal SAR access attempted (Anti-Tipping-Off enforcement)', {
      actorRole,
      violation: 'BSA_TIPPING_OFF_PREVENTION_BREACH',
      statusCode: 403,
    });

    throw new UnauthorizedSarAccessError(
      `Access Denied: SAR case records are strictly confidential under BSA/FinCEN regulations (31 U.S.C. § 5318(g)(2)). Role '${actorRole}' is prohibited from viewing or querying SAR documentation.`
    );
  }
}

/**
 * Compiles an automated evidence pack for SAR narrative support.
 */
export function assembleSarEvidencePack(params: {
  transactions: Array<{
    id: string;
    amount: Money;
    createdAt: string;
    chargebackReason?: string | undefined;
    isCardTestingPattern?: boolean | undefined;
  }>;
  ipAddresses: string[];
  deviceFingerprints: string[];
  kycDocumentIds: string[];
  alertNotes: string[];
}): SarEvidencePack {
  return {
    transactionTimeline: params.transactions.map((tx) => ({
      transactionId: tx.id,
      amountUsd: tx.amount.toNumericString(),
      timestamp: tx.createdAt,
      chargebackReason: tx.chargebackReason,
      isCardTestingPattern: tx.isCardTestingPattern,
    })),
    ipAddresses: [...new Set(params.ipAddresses)],
    deviceFingerprints: [...new Set(params.deviceFingerprints)],
    kycDocumentIds: [...params.kycDocumentIds],
    flaggedAlertNotes: [...params.alertNotes],
    compiledAt: new Date().toISOString(),
  };
}

/**
 * Creates a confidential Suspicious Activity Report (SAR) case file.
 */
export function createSarCase(input: CreateSarCaseInput): SarCaseEntity {
  assertSarRoleAccess(input.actorRole);

  if (!input.narrative || input.narrative.trim().length < 50) {
    throw new Error('SAR narrative must contain a detailed factual description (minimum 50 characters).');
  }

  const id = generateUuidV7();
  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const caseNumber = `SAR-${year}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  logger.info('Confidential SAR case file created', {
    caseNumber,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
  });

  return {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    caseNumber,
    status: 'draft',
    suspectDetails: input.suspectDetails,
    suspiciousActivityCategories: input.suspiciousActivityCategories,
    narrative: input.narrative.trim(),
    evidencePack: input.evidencePack,
    fictitiousTransactionCount: input.fictitiousTransactionCount ?? 0,
    totalSuspiciousAmountUsd: input.totalSuspiciousAmountUsd.toNumericString(),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Marks a SAR case as formally filed with FinCEN / Financial Intelligence Unit (FIU).
 */
export function fileSarWithFinCEN(input: FileSarCaseInput): SarCaseEntity {
  assertSarRoleAccess(input.actorRole);

  if (input.sarCase.status === 'filed') {
    throw new Error('SAR case has already been filed with FinCEN.');
  }

  if (!input.fincenBsaIdentifier || input.fincenBsaIdentifier.trim().length < 8) {
    throw new Error('Valid FinCEN BSA filing tracking identifier is required.');
  }

  const now = new Date().toISOString();

  logger.info('SAR case formally filed with FinCEN', {
    caseNumber: input.sarCase.caseNumber,
    bsaIdentifier: input.fincenBsaIdentifier,
    filedByUserId: input.actorUserId,
  });

  return {
    ...input.sarCase,
    status: 'filed',
    fincenBsaIdentifier: input.fincenBsaIdentifier.trim(),
    filedByUserId: input.actorUserId,
    filedAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieves confidential SAR case details, strictly guarded against tipping-off breaches.
 */
export function getSarCaseConfidential(
  sarCase: SarCaseEntity,
  actorRole: Role
): SarCaseEntity {
  assertSarRoleAccess(actorRole);
  return sarCase;
}
