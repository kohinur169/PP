// path: lib/compliance/sanctions.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';

export type SanctionsListSource =
  | 'OFAC_SDN'
  | 'UN_CONSOLIDATED'
  | 'EU_CONSOLIDATED'
  | 'UK_OFSI'
  | 'PEP_GLOBAL';

export type SanctionsMatchStatus =
  | 'CLEARED_NO_MATCH'
  | 'POTENTIAL_MATCH_HOLD'
  | 'CONFIRMED_TRUE_POSITIVE'
  | 'RESOLVED_FALSE_POSITIVE';

export interface SanctionsWatchlistEntry {
  id: string;
  source: SanctionsListSource;
  fullName: string;
  aliases: string[];
  dateOfBirth?: string;
  nationality?: string;
  sanctionProgram?: string;
  pepTier?: 1 | 2 | 3;
}

export interface SanctionsScreeningSubject {
  entityId: string;
  fullName: string;
  dateOfBirth?: string;
  nationality?: string;
  country?: string;
  isUboOrDirector?: boolean;
}

export interface SanctionsMatchHit {
  watchlistEntry: SanctionsWatchlistEntry;
  nameSimilarityScore: number;
  dobMatch: boolean;
  nationalityMatch: boolean;
  compositeMatchScore: number;
  isPep: boolean;
}

export interface SanctionsScreeningResult {
  screeningId: string;
  screenedAt: string;
  subject: SanctionsScreeningSubject;
  status: SanctionsMatchStatus;
  highestMatchScore: number;
  hits: SanctionsMatchHit[];
  action: 'ACTIVATE_ACCOUNT' | 'HOLD_FOR_MANUAL_REVIEW' | 'FREEZE_AND_BLOCK_ASSETS';
  requiresEdd: boolean;
  notes: string;
}

export interface SanctionsDisambiguationResolutionInput {
  screeningId: string;
  decision: 'RESOLVED_FALSE_POSITIVE' | 'CONFIRMED_TRUE_POSITIVE';
  rationale: string;
  complianceOfficerId: string;
  evidenceDocumentIds: string[];
  clientIp: string;
}

export interface SanctionsDisambiguationRecord {
  resolutionId: string;
  screeningId: string;
  decision: 'RESOLVED_FALSE_POSITIVE' | 'CONFIRMED_TRUE_POSITIVE';
  rationale: string;
  complianceOfficerId: string;
  evidenceDocumentIds: string[];
  resolvedAt: string;
  digitalFingerprint: string;
}

/**
 * Normalizes a personal or entity name for phonetic & fuzzy comparisons.
 */
export function normalizeNameForScreening(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates string similarity using Dice's bigram coefficient (0 to 100).
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeNameForScreening(str1);
  const s2 = normalizeNameForScreening(str2);

  if (s1 === s2) return 100;
  if (s1.length < 2 || s2.length < 2) return 0;

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);

  let intersectionSize = 0;
  for (const [bigram, count1] of b1.entries()) {
    if (b2.has(bigram)) {
      intersectionSize += Math.min(count1, b2.get(bigram)!);
    }
  }

  const totalBigrams = s1.length - 1 + (s2.length - 1);
  const coefficient = (2 * intersectionSize) / totalBigrams;
  return Math.round(coefficient * 100);
}

/**
 * Performs screening of a subject against sanctions watchlists.
 */
export function screenSubjectAgainstWatchlist(
  subject: SanctionsScreeningSubject,
  watchlist: SanctionsWatchlistEntry[]
): SanctionsScreeningResult {
  const screeningId = generateUuidV7();
  const screenedAt = new Date().toISOString();
  const hits: SanctionsMatchHit[] = [];

  for (const entry of watchlist) {
    const candidateNames = [entry.fullName, ...entry.aliases];
    let maxNameSim = 0;

    for (const name of candidateNames) {
      const sim = calculateStringSimilarity(subject.fullName, name);
      if (sim > maxNameSim) {
        maxNameSim = sim;
      }
    }

    if (maxNameSim < 50) {
      continue;
    }

    let dobMatch = false;
    if (subject.dateOfBirth && entry.dateOfBirth) {
      dobMatch = subject.dateOfBirth === entry.dateOfBirth;
    }

    let nationalityMatch = false;
    if (subject.nationality && entry.nationality) {
      nationalityMatch =
        subject.nationality.toUpperCase() === entry.nationality.toUpperCase();
    }

    // Weighted composite score: Name (70%), DOB (20%), Nationality (10%)
    let composite = maxNameSim * 0.7;
    if (dobMatch) composite += 20;
    if (nationalityMatch) composite += 10;
    const compositeMatchScore = Math.min(100, Math.round(composite));

    hits.push({
      watchlistEntry: entry,
      nameSimilarityScore: maxNameSim,
      dobMatch,
      nationalityMatch,
      compositeMatchScore,
      isPep: entry.source === 'PEP_GLOBAL',
    });
  }

  // Sort hits descending by composite score
  hits.sort((a, b) => b.compositeMatchScore - a.compositeMatchScore);

  const highestHit = hits[0];
  const highestScore = highestHit ? highestHit.compositeMatchScore : 0;
  const isPepHit = hits.some((h) => h.isPep && h.compositeMatchScore >= 70);

  let status: SanctionsMatchStatus = 'CLEARED_NO_MATCH';
  let action: 'ACTIVATE_ACCOUNT' | 'HOLD_FOR_MANUAL_REVIEW' | 'FREEZE_AND_BLOCK_ASSETS' =
    'ACTIVATE_ACCOUNT';
  let requiresEdd = false;

  const hasAssetFreezeSanctionsHit = hits.some(
    (h) => !h.isPep && h.compositeMatchScore >= 85
  );

  if (hasAssetFreezeSanctionsHit) {
    status = 'CONFIRMED_TRUE_POSITIVE';
    action = 'FREEZE_AND_BLOCK_ASSETS';
    requiresEdd = true;
  } else if (highestScore >= 60 || isPepHit) {
    status = 'POTENTIAL_MATCH_HOLD';
    action = 'HOLD_FOR_MANUAL_REVIEW';
    requiresEdd = isPepHit;
  }

  const notes =
    hits.length === 0
      ? 'Clean screening. Zero watchlist matches detected across OFAC, UN, EU, UK HMT, and PEP registers.'
      : `Flagged ${hits.length} potential watchlist hit(s). Top match: ${highestHit.watchlistEntry.fullName} (${highestHit.watchlistEntry.source}, score ${highestScore}%). Status: ${status}.`;

  return {
    screeningId,
    screenedAt,
    subject,
    status,
    highestMatchScore: highestScore,
    hits,
    action,
    requiresEdd,
    notes,
  };
}

/**
 * Creates an immutable cryptographic record of a False Positive disambiguation or True Positive confirmation.
 */
export function recordSanctionsDisambiguation(
  input: SanctionsDisambiguationResolutionInput
): SanctionsDisambiguationRecord {
  const resolutionId = generateUuidV7();
  const resolvedAt = new Date().toISOString();

  const canonicalPayload = JSON.stringify({
    resolutionId,
    screeningId: input.screeningId,
    decision: input.decision,
    rationale: input.rationale,
    complianceOfficerId: input.complianceOfficerId,
    evidenceDocumentIds: input.evidenceDocumentIds,
    resolvedAt,
    clientIp: input.clientIp,
  });

  const digitalFingerprint = crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  return {
    resolutionId,
    screeningId: input.screeningId,
    decision: input.decision,
    rationale: input.rationale,
    complianceOfficerId: input.complianceOfficerId,
    evidenceDocumentIds: input.evidenceDocumentIds,
    resolvedAt,
    digitalFingerprint,
  };
}
