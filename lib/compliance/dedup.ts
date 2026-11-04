// path: lib/compliance/dedup.ts

import {
  generateBlindIndex,
  generateDocumentBlindIndex,
  generateTaxIdBlindIndex,
  normalizePhone,
  normalizeBankAccount,
  normalizeRoutingCode,
} from '@/lib/crypto/hash';
import { generateUuidV7 } from '@/lib/db/uuidv7';

export type DuplicateSignalType =
  | 'email'
  | 'phone'
  | 'id_document'
  | 'tax_id'
  | 'bank_account_fingerprint'
  | 'name_dob';

export interface MerchantProfileSignals {
  email: string;
  phone: string;
  idDocumentNumber: string;
  taxId: string;
  bankRoutingNumber: string;
  bankAccountNumber: string;
  legalFullName: string;
  dateOfBirth: string; // YYYY-MM-DD
}

export interface StoredSignalRecord {
  id: string;
  tenantId: string;
  userId?: string;
  companyId?: string;
  signalType: DuplicateSignalType;
  signalValueHash: string;
  status: 'active' | 'closed' | 'flagged_duplicate';
}

export interface MatchedSignal {
  signalType: DuplicateSignalType;
  matchedRecordId: string;
  matchedCompanyId?: string | undefined;
  matchedUserId?: string | undefined;
}

export interface DuplicateCheckResult {
  checkId: string;
  isDuplicate: boolean;
  action: 'ALLOW_CREATION' | 'BLOCK_AND_FLAG_REVIEW';
  status: 'eligible' | 'duplicate_review';
  matchedSignals: MatchedSignal[];
  applicantFacingMessage?: string;
  internalComplianceAlert?: string;
  computedHashes: Record<DuplicateSignalType, string>;
}

export const GENERIC_DUPLICATE_APPLICANT_MESSAGE =
  'An account associated with these details already exists. Please contact support.';

/**
 * Computes all 6 cryptographic blind index hashes for a merchant onboarding profile.
 */
export function computeProfileSignalHashes(
  profile: MerchantProfileSignals,
  blindIndexKey?: Buffer | string | undefined
): Record<DuplicateSignalType, string> {
  const normalizedEmail = profile.email.toLowerCase().trim();
  const emailHash = generateBlindIndex(normalizedEmail, blindIndexKey);

  const normalizedPhoneVal = normalizePhone(profile.phone);
  const phoneHash = generateBlindIndex(normalizedPhoneVal, blindIndexKey);

  const idDocHash = generateDocumentBlindIndex(profile.idDocumentNumber, blindIndexKey);

  const taxIdHash = generateTaxIdBlindIndex(profile.taxId, blindIndexKey);

  const normalizedRouting = normalizeRoutingCode(profile.bankRoutingNumber);
  const normalizedAccount = normalizeBankAccount(profile.bankAccountNumber);
  const bankFingerprintRaw = `${normalizedRouting}:${normalizedAccount}`;
  const bankAccountFingerprintHash = generateBlindIndex(bankFingerprintRaw, blindIndexKey);

  const normalizedName = profile.legalFullName.toLowerCase().replace(/[^a-z]/g, '').trim();
  const normalizedDob = profile.dateOfBirth.trim();
  const nameDobRaw = `${normalizedName}:${normalizedDob}`;
  const nameDobHash = generateBlindIndex(nameDobRaw, blindIndexKey);

  return {
    email: emailHash,
    phone: phoneHash,
    id_document: idDocHash,
    tax_id: taxIdHash,
    bank_account_fingerprint: bankAccountFingerprintHash,
    name_dob: nameDobHash,
  };
}

/**
 * Scans a merchant profile against the pool of existing active/closed signals across 6 distinct vectors.
 */
export function checkDuplicateSignals(
  profile: MerchantProfileSignals,
  existingSignalsPool: StoredSignalRecord[],
  blindIndexKey?: Buffer | string | undefined
): DuplicateCheckResult {
  const checkId = generateUuidV7();
  const computedHashes = computeProfileSignalHashes(profile, blindIndexKey);
  const matchedSignals: MatchedSignal[] = [];

  const signalTypes: DuplicateSignalType[] = [
    'email',
    'phone',
    'id_document',
    'tax_id',
    'bank_account_fingerprint',
    'name_dob',
  ];

  for (const sigType of signalTypes) {
    const currentHash = computedHashes[sigType];
    const match = existingSignalsPool.find(
      (stored) =>
        stored.signalType === sigType &&
        stored.signalValueHash === currentHash &&
        stored.status !== 'flagged_duplicate'
    );

    if (match) {
      matchedSignals.push({
        signalType: sigType,
        matchedRecordId: match.id,
        matchedCompanyId: match.companyId,
        matchedUserId: match.userId,
      });
    }
  }

  if (matchedSignals.length > 0) {
    const matchedCategories = matchedSignals.map((m) => m.signalType).join(', ');
    return {
      checkId,
      isDuplicate: true,
      action: 'BLOCK_AND_FLAG_REVIEW',
      status: 'duplicate_review',
      matchedSignals,
      applicantFacingMessage: GENERIC_DUPLICATE_APPLICANT_MESSAGE,
      internalComplianceAlert: `CRITICAL DEDUP ALERT: Potential duplicate entity or multi-account violation detected. Signals matched: [${matchedCategories}]. Automated creation halted.`,
      computedHashes,
    };
  }

  return {
    checkId,
    isDuplicate: false,
    action: 'ALLOW_CREATION',
    status: 'eligible',
    matchedSignals: [],
    computedHashes,
  };
}
