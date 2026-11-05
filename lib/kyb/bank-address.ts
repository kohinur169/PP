// path: lib/kyb/bank-address.ts

export const PROOF_OF_ADDRESS_MAX_AGE_DAYS = 90;
export const NAME_MATCH_AUTO_APPROVE_THRESHOLD = 0.88;
export const NAME_MATCH_MANUAL_REVIEW_THRESHOLD = 0.70;

export interface ProofOfAddressValidationResult {
  valid: boolean;
  ageDays: number;
  maxAllowedDays: number;
  issueDateIso: string;
  reason?: string | undefined;
}

export interface BankAccountVerificationResult {
  similarityScore: number; // 0.00 to 1.00
  decision: 'AUTO_APPROVED' | 'MANUAL_REVIEW' | 'REJECTED';
  isPersonalAccountSuspected: boolean;
  normalizedBusinessName: string;
  normalizedBankHolderName: string;
  reasons: string[];
}

export interface CombinedKybVerificationReport {
  isFullyVerified: boolean;
  requiresManualReview: boolean;
  addressProof: ProofOfAddressValidationResult;
  bankAccount: BankAccountVerificationResult;
  summary: string;
}

/**
 * Normalizes corporate legal business name by stripping legal suffixes, punctuation, and excess spaces.
 */
export function normalizeBusinessName(name: string): string {
  let cleaned = name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Normalize common entity abbreviations
  const substitutions: [RegExp, string][] = [
    [/\blimited liability company\b/g, 'llc'],
    [/\bincorporated\b/g, 'inc'],
    [/\bcorporation\b/g, 'corp'],
    [/\blimited\b/g, 'ltd'],
    [/\bcompany\b/g, 'co'],
    [/\bprofessional limited liability company\b/g, 'pllc'],
    [/\bgeneral partnership\b/g, 'gp'],
    [/\band\b/g, ''],
    [/\bthe\b/g, ''],
  ];

  for (const [regex, sub] of substitutions) {
    cleaned = cleaned.replace(regex, sub).replace(/\s+/g, ' ').trim();
  }

  return cleaned;
}

/**
 * Calculates Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Calculates Jaccard token overlap between two phrases.
 */
function jaccardTokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

/**
 * Computes a weighted composite similarity score (0.0 to 1.0) between two names.
 */
export function computeNameFuzzySimilarity(nameA: string, nameB: string): number {
  const normA = normalizeBusinessName(nameA);
  const normB = normalizeBusinessName(nameB);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const maxLen = Math.max(normA.length, normB.length);
  const levDist = levenshteinDistance(normA, normB);
  const levScore = Math.max(0, 1 - levDist / maxLen);

  const jaccardScore = jaccardTokenSimilarity(normA, normB);

  // Composite: 50% Levenshtein, 50% Token Jaccard
  return parseFloat((0.5 * levScore + 0.5 * jaccardScore).toFixed(4));
}

/**
 * Validates that proof of address document (utility bill, bank statement) was issued within the last 90 days.
 */
export function validateProofOfAddressDate(
  issueDateInput: string | Date,
  referenceDate: Date = new Date()
): ProofOfAddressValidationResult {
  const issueDate = new Date(issueDateInput);

  if (isNaN(issueDate.getTime())) {
    return {
      valid: false,
      ageDays: -1,
      maxAllowedDays: PROOF_OF_ADDRESS_MAX_AGE_DAYS,
      issueDateIso: '',
      reason: 'Invalid or unparseable proof of address issue date.',
    };
  }

  const issueDateIso = issueDate.toISOString().split('T')[0]!;
  const diffMs = referenceDate.getTime() - issueDate.getTime();

  // If issue date is in the future by more than 1 day
  if (diffMs < -24 * 60 * 60 * 1000) {
    return {
      valid: false,
      ageDays: Math.floor(diffMs / (24 * 60 * 60 * 1000)),
      maxAllowedDays: PROOF_OF_ADDRESS_MAX_AGE_DAYS,
      issueDateIso,
      reason: `Document issue date (${issueDateIso}) cannot be in the future.`,
    };
  }

  const ageDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));

  if (ageDays > PROOF_OF_ADDRESS_MAX_AGE_DAYS) {
    return {
      valid: false,
      ageDays,
      maxAllowedDays: PROOF_OF_ADDRESS_MAX_AGE_DAYS,
      issueDateIso,
      reason: `Proof of address was issued ${ageDays} days ago, exceeding the regulatory ${PROOF_OF_ADDRESS_MAX_AGE_DAYS}-day freshness limit.`,
    };
  }

  return {
    valid: true,
    ageDays,
    maxAllowedDays: PROOF_OF_ADDRESS_MAX_AGE_DAYS,
    issueDateIso,
  };
}

/**
 * Verifies payout bank account ownership against registered corporate entity name.
 * Rejects personal accounts for corporate merchants and routes partial matches to manual compliance review.
 */
export function verifyPayoutBankAccount(params: {
  legalBusinessName: string;
  dbaName?: string | undefined;
  entityType: 'corporation' | 'llc' | 'partnership' | 'sole_proprietorship';
  bankAccountHolderName: string;
  routingNumber: string;
  accountNumber: string;
  bankCountry?: string | undefined;
}): BankAccountVerificationResult {
  const normBusiness = normalizeBusinessName(params.legalBusinessName);
  const normDba = params.dbaName ? normalizeBusinessName(params.dbaName) : '';
  const normBank = normalizeBusinessName(params.bankAccountHolderName);

  const reasons: string[] = [];

  // Match against legal business name or DBA
  const scoreLegal = computeNameFuzzySimilarity(params.legalBusinessName, params.bankAccountHolderName);
  const scoreDba = params.dbaName
    ? computeNameFuzzySimilarity(params.dbaName, params.bankAccountHolderName)
    : 0;
  const bestScore = Math.max(scoreLegal, scoreDba);

  // Detect personal account for corporate entity (e.g. LLC/Corp account registered to "John Doe")
  let isPersonalAccountSuspected = false;
  const corporateKeywords = ['inc', 'corp', 'llc', 'ltd', 'co', 'pllc', 'enterprises', 'holdings', 'systems', 'solutions', 'technologies', 'consulting', 'group', 'services'];
  const hasCorporateKeywordInBusiness = corporateKeywords.some((kw) => normBusiness.includes(kw));
  const hasCorporateKeywordInBank = corporateKeywords.some((kw) => normBank.includes(kw));

  if (
    (params.entityType === 'corporation' || params.entityType === 'llc') &&
    hasCorporateKeywordInBusiness &&
    !hasCorporateKeywordInBank &&
    bestScore < NAME_MATCH_AUTO_APPROVE_THRESHOLD
  ) {
    // Looks like a personal account for a corporate entity
    isPersonalAccountSuspected = true;
    reasons.push(
      `Personal bank account detected for corporate entity '${params.legalBusinessName}'. Payout accounts must be registered under the corporate entity name.`
    );
  }

  let decision: 'AUTO_APPROVED' | 'MANUAL_REVIEW' | 'REJECTED';

  if (isPersonalAccountSuspected && params.entityType !== 'sole_proprietorship') {
    decision = 'REJECTED';
  } else if (bestScore >= NAME_MATCH_AUTO_APPROVE_THRESHOLD) {
    decision = 'AUTO_APPROVED';
  } else if (bestScore >= NAME_MATCH_MANUAL_REVIEW_THRESHOLD) {
    decision = 'MANUAL_REVIEW';
    reasons.push(
      `Bank holder name '${params.bankAccountHolderName}' partially matches registered name (similarity: ${(bestScore * 100).toFixed(1)}%). Routed to Compliance Officer for manual visual check.`
    );
  } else {
    decision = 'REJECTED';
    reasons.push(
      `Bank holder name '${params.bankAccountHolderName}' does not match registered corporate name '${params.legalBusinessName}' (similarity: ${(bestScore * 100).toFixed(1)}% < ${(NAME_MATCH_MANUAL_REVIEW_THRESHOLD * 100).toFixed(1)}%).`
    );
  }

  return {
    similarityScore: bestScore,
    decision,
    isPersonalAccountSuspected,
    normalizedBusinessName: normBusiness,
    normalizedBankHolderName: normBank,
    reasons,
  };
}

/**
 * Combines proof of address freshness and bank account verification into a unified KYB gate report.
 */
export function evaluateAddressAndBankVerification(input: {
  addressIssueDate: string | Date;
  legalBusinessName: string;
  dbaName?: string | undefined;
  entityType: 'corporation' | 'llc' | 'partnership' | 'sole_proprietorship';
  bankAccountHolderName: string;
  routingNumber: string;
  accountNumber: string;
  referenceDate?: Date | undefined;
}): CombinedKybVerificationReport {
  const addressReport = validateProofOfAddressDate(input.addressIssueDate, input.referenceDate);
  const bankReport = verifyPayoutBankAccount({
    legalBusinessName: input.legalBusinessName,
    dbaName: input.dbaName,
    entityType: input.entityType,
    bankAccountHolderName: input.bankAccountHolderName,
    routingNumber: input.routingNumber,
    accountNumber: input.accountNumber,
  });

  const isFullyVerified = addressReport.valid && bankReport.decision === 'AUTO_APPROVED';
  const requiresManualReview =
    !isFullyVerified &&
    addressReport.valid &&
    bankReport.decision === 'MANUAL_REVIEW';

  let summary: string;
  if (isFullyVerified) {
    summary = 'Address proof and payout bank account successfully verified.';
  } else if (requiresManualReview) {
    summary = 'Address proof verified. Bank account name match requires Compliance Officer manual sign-off.';
  } else {
    const errorMessages = [
      addressReport.reason,
      ...bankReport.reasons,
    ].filter(Boolean);
    summary = `Verification blocked: ${errorMessages.join(' | ')}`;
  }

  return {
    isFullyVerified,
    requiresManualReview,
    addressProof: addressReport,
    bankAccount: bankReport,
    summary,
  };
}
