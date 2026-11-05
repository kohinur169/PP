// path: lib/compliance/sanctions.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { computeNameFuzzySimilarity } from '@/lib/kyb/bank-address';

export const DEFAULT_SANCTIONS_SIMILARITY_THRESHOLD = 0.85;

export type SanctionsListSource =
  | 'OFAC_SDN'
  | 'UN_CONSOLIDATED'
  | 'EU_CONSOLIDATED'
  | 'EU_FSF'
  | 'UK_OFSI'
  | 'UK_HMT'
  | 'PEP_GLOBAL';

export type SanctionsMatchStatus =
  | 'CLEARED_NO_MATCH'
  | 'POTENTIAL_MATCH_HOLD'
  | 'CONFIRMED_TRUE_POSITIVE'
  | 'RESOLVED_FALSE_POSITIVE';

export interface SanctionsWatchlistEntry {
  id: string;
  source: SanctionsListSource;
  listSource?: SanctionsListSource | undefined;
  fullName: string;
  primaryName?: string | undefined;
  aliases: string[];
  entityType?: 'individual' | 'entity' | 'vessel' | 'aircraft' | undefined;
  dateOfBirth?: string | undefined;
  nationality?: string | undefined;
  countryCode?: string | undefined;
  sanctionProgram?: string | undefined;
  publicationDate?: string | undefined;
  pepTier?: 1 | 2 | 3 | undefined;
}

export type SanctionEntry = SanctionsWatchlistEntry;

export interface SanctionsScreeningSubject {
  entityId: string;
  fullName: string;
  dateOfBirth?: string | undefined;
  nationality?: string | undefined;
  country?: string | undefined;
  isUboOrDirector?: boolean | undefined;
}

export interface SanctionsMatchHit {
  watchlistEntry: SanctionsWatchlistEntry;
  nameSimilarityScore: number;
  dobMatch: boolean;
  nationalityMatch: boolean;
  compositeMatchScore: number;
  isPep: boolean;
  // Step 103 compatibility
  sanctionEntryId?: string | undefined;
  listSource?: SanctionsListSource | undefined;
  matchedName?: string | undefined;
  queryName?: string | undefined;
  similarityScore?: number | undefined;
  sanctionProgram?: string | undefined;
}

export interface SanctionsScreeningResult {
  screeningId: string;
  screenedAt: string;
  subject?: SanctionsScreeningSubject | undefined;
  status: SanctionsMatchStatus;
  highestMatchScore: number;
  highestSimilarity: number;
  isMatchFound: boolean;
  bestMatch?: SanctionsMatchHit | undefined;
  hits: SanctionsMatchHit[];
  decision: 'CLEARED' | 'INVESTIGATION_REQUIRED' | 'CONFIRMED_MATCH';
  action: 'ACTIVATE_ACCOUNT' | 'HOLD_FOR_MANUAL_REVIEW' | 'FREEZE_AND_BLOCK_ASSETS';
  isActivationBlocked: boolean;
  isPayoutBlocked: boolean;
  requiresEdd: boolean;
  reasons: string[];
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

export interface MerchantSanctionsAuditReport {
  screeningId: string;
  overallDecision: 'CLEARED' | 'INVESTIGATION_REQUIRED' | 'CONFIRMED_MATCH';
  isActivationBlocked: boolean;
  isPayoutBlocked: boolean;
  totalEntitiesScreened: number;
  flaggedHitsCount: number;
  hits: Array<{
    entityRole: 'merchant' | 'dba' | 'director' | 'ubo';
    entityName: string;
    result: SanctionsScreeningResult;
  }>;
  investigationCaseId?: string | undefined;
  screenedAt: string;
}

/**
 * Built-in representative reference catalogue of designated individuals and entities
 * from official OFAC SDN, UN Consolidated, EU FSF, and UK HMT sanctions lists.
 */
export const OFFICIAL_SANCTIONED_ENTITIES: SanctionEntry[] = [
  {
    id: 'ofac_sdn_001',
    source: 'OFAC_SDN',
    listSource: 'OFAC_SDN',
    entityType: 'entity',
    fullName: 'Sberbank of Russia PJSC',
    primaryName: 'Sberbank of Russia PJSC',
    aliases: ['Sberbank', 'Joint Stock Company Sberbank', 'Sberbank Rossii'],
    sanctionProgram: 'UKRAINE-EO14024',
    countryCode: 'RU',
    publicationDate: '2024-02-23',
  },
  {
    id: 'ofac_sdn_002',
    source: 'OFAC_SDN',
    listSource: 'OFAC_SDN',
    entityType: 'entity',
    fullName: 'VTB Bank Public Joint Stock Company',
    primaryName: 'VTB Bank Public Joint Stock Company',
    aliases: ['VTB Bank', 'Bank VTB OAO', 'Vneshtorgbank'],
    sanctionProgram: 'UKRAINE-EO14024',
    countryCode: 'RU',
    publicationDate: '2024-02-23',
  },
  {
    id: 'ofac_sdn_003',
    source: 'OFAC_SDN',
    listSource: 'OFAC_SDN',
    entityType: 'individual',
    fullName: 'Viktor Anatolyevich Bout',
    primaryName: 'Viktor Anatolyevich Bout',
    aliases: ['Viktor Butt', 'Victor But', 'Boris', 'Vadim Markovich Aminov'],
    sanctionProgram: 'SDGT / ARMS',
    countryCode: 'RU',
    publicationDate: '2023-01-15',
  },
  {
    id: 'ofac_sdn_004',
    source: 'OFAC_SDN',
    listSource: 'OFAC_SDN',
    entityType: 'entity',
    fullName: 'Tornado Cash Virtual Currency Mixer',
    primaryName: 'Tornado Cash Virtual Currency Mixer',
    aliases: ['Tornado Cash', 'TornadoCash Classic'],
    sanctionProgram: 'CYBER2',
    publicationDate: '2022-08-08',
  },
  {
    id: 'ofac_sdn_005',
    source: 'OFAC_SDN',
    listSource: 'OFAC_SDN',
    entityType: 'entity',
    fullName: 'Lazarus Group',
    primaryName: 'Lazarus Group',
    aliases: ['Guardians of Peace', 'Whois Hacking Team', 'HIDDEN COBRA'],
    sanctionProgram: 'DPRK',
    countryCode: 'KP',
    publicationDate: '2019-09-13',
  },
  {
    id: 'un_sanct_001',
    source: 'UN_CONSOLIDATED',
    listSource: 'UN_CONSOLIDATED',
    entityType: 'entity',
    fullName: 'Al-Qaida International',
    primaryName: 'Al-Qaida International',
    aliases: ['The Base', 'Islamic Army for the Liberation of the Holy Places'],
    sanctionProgram: 'UN-ISIL-ALQAIDA',
    publicationDate: '2023-06-01',
  },
  {
    id: 'eu_fsf_001',
    source: 'EU_FSF',
    listSource: 'EU_FSF',
    entityType: 'entity',
    fullName: 'PMC Wagner Group',
    primaryName: 'PMC Wagner Group',
    aliases: ['ChVK Wagner', 'Wagner Private Military Company'],
    sanctionProgram: 'EU-UKRAINE-TERRITORIAL-INTEGRITY',
    countryCode: 'RU',
    publicationDate: '2023-04-13',
  },
  {
    id: 'uk_hmt_001',
    source: 'UK_HMT',
    listSource: 'UK_HMT',
    entityType: 'entity',
    fullName: 'Rosneft Oil Company',
    primaryName: 'Rosneft Oil Company',
    aliases: ['Public Joint Stock Company Rosneft Oil Company', 'NK Rosneft'],
    sanctionProgram: 'RUSSIA-SANCTIONS-UK-2019',
    countryCode: 'RU',
    publicationDate: '2024-03-01',
  },
];

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
 * Computes highest similarity between a query name and a sanction entry.
 */
export function matchNameAgainstSanctionEntry(
  queryName: string,
  entry: SanctionEntry
): { highestScore: number; bestMatchedName: string } {
  const primary = entry.primaryName ?? entry.fullName;
  let highestScore = computeNameFuzzySimilarity(queryName, primary);
  let bestMatchedName = primary;

  for (const alias of entry.aliases) {
    const aliasScore = computeNameFuzzySimilarity(queryName, alias);
    if (aliasScore > highestScore) {
      highestScore = aliasScore;
      bestMatchedName = alias;
    }
  }

  return { highestScore, bestMatchedName };
}

/**
 * Screens an individual or business entity against official sanctions records.
 */
export function screenEntityAgainstSanctions(params: {
  entityName: string;
  threshold?: number | undefined;
  sanctionedList?: SanctionEntry[] | undefined;
}): SanctionsScreeningResult {
  const screeningId = generateUuidV7();
  const screenedAt = new Date().toISOString();
  const threshold = params.threshold ?? DEFAULT_SANCTIONS_SIMILARITY_THRESHOLD;
  const list = params.sanctionedList ?? OFFICIAL_SANCTIONED_ENTITIES;

  let highestSimilarity = 0;
  let bestHit: SanctionsMatchHit | undefined;
  const hits: SanctionsMatchHit[] = [];

  for (const entry of list) {
    const { highestScore, bestMatchedName } = matchNameAgainstSanctionEntry(
      params.entityName,
      entry
    );

    if (highestScore > highestSimilarity) {
      highestSimilarity = highestScore;
      const hitObj: SanctionsMatchHit = {
        watchlistEntry: entry,
        nameSimilarityScore: Math.round(highestScore * 100),
        dobMatch: false,
        nationalityMatch: false,
        compositeMatchScore: Math.round(highestScore * 100),
        isPep: entry.source === 'PEP_GLOBAL',
        sanctionEntryId: entry.id,
        listSource: entry.listSource ?? entry.source,
        matchedName: bestMatchedName,
        queryName: params.entityName,
        similarityScore: highestScore,
        sanctionProgram: entry.sanctionProgram,
      };
      bestHit = hitObj;
      hits.unshift(hitObj);
    }
  }

  const isMatchFound = highestSimilarity >= threshold;
  let decision: 'CLEARED' | 'INVESTIGATION_REQUIRED' | 'CONFIRMED_MATCH';
  let status: SanctionsMatchStatus;
  let action: 'ACTIVATE_ACCOUNT' | 'HOLD_FOR_MANUAL_REVIEW' | 'FREEZE_AND_BLOCK_ASSETS';
  const reasons: string[] = [];

  if (highestSimilarity >= 0.95) {
    decision = 'CONFIRMED_MATCH';
    status = 'CONFIRMED_TRUE_POSITIVE';
    action = 'FREEZE_AND_BLOCK_ASSETS';
    reasons.push(
      `Exact / near-exact sanctions match (${(highestSimilarity * 100).toFixed(1)}%) with ${bestHit?.listSource} entry '${bestHit?.matchedName}' [Program: ${bestHit?.sanctionProgram}].`
    );
  } else if (highestSimilarity >= threshold) {
    decision = 'INVESTIGATION_REQUIRED';
    status = 'POTENTIAL_MATCH_HOLD';
    action = 'HOLD_FOR_MANUAL_REVIEW';
    reasons.push(
      `Potential sanctions hit (${(highestSimilarity * 100).toFixed(1)}% >= ${(threshold * 100).toFixed(1)}%) with ${bestHit?.listSource} entry '${bestHit?.matchedName}'. Automated activation halted; compliance investigation opened.`
    );
  } else {
    decision = 'CLEARED';
    status = 'CLEARED_NO_MATCH';
    action = 'ACTIVATE_ACCOUNT';
  }

  return {
    screeningId,
    screenedAt,
    status,
    highestMatchScore: Math.round(highestSimilarity * 100),
    highestSimilarity,
    isMatchFound,
    bestMatch: isMatchFound ? bestHit : undefined,
    hits,
    decision,
    action,
    isActivationBlocked: isMatchFound,
    isPayoutBlocked: isMatchFound,
    requiresEdd: isMatchFound,
    reasons,
    notes: reasons.join(' ') || 'Screening cleared with zero designated hits.',
  };
}

/**
 * Performs screening of a subject against sanctions watchlists (Policy screening engine).
 */
export function screenSubjectAgainstWatchlist(
  subject: SanctionsScreeningSubject,
  watchlist: SanctionsWatchlistEntry[]
): SanctionsScreeningResult {
  const screeningId = generateUuidV7();
  const screenedAt = new Date().toISOString();
  const hits: SanctionsMatchHit[] = [];

  for (const entry of watchlist) {
    const candidateNames = [entry.fullName, ...(entry.aliases ?? [])];
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
      sanctionEntryId: entry.id,
      listSource: entry.source,
      matchedName: entry.fullName,
      queryName: subject.fullName,
      similarityScore: compositeMatchScore / 100,
      sanctionProgram: entry.sanctionProgram,
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
  let decision: 'CLEARED' | 'INVESTIGATION_REQUIRED' | 'CONFIRMED_MATCH' = 'CLEARED';
  let requiresEdd = false;

  const hasAssetFreezeSanctionsHit = hits.some(
    (h) => !h.isPep && h.compositeMatchScore >= 85
  );

  if (hasAssetFreezeSanctionsHit) {
    status = 'CONFIRMED_TRUE_POSITIVE';
    action = 'FREEZE_AND_BLOCK_ASSETS';
    decision = 'CONFIRMED_MATCH';
    requiresEdd = true;
  } else if (highestScore >= 60 || isPepHit) {
    status = 'POTENTIAL_MATCH_HOLD';
    action = 'HOLD_FOR_MANUAL_REVIEW';
    decision = 'INVESTIGATION_REQUIRED';
    requiresEdd = isPepHit;
  }

  const isMatchFound = status !== 'CLEARED_NO_MATCH';
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
    highestSimilarity: highestScore / 100,
    isMatchFound,
    bestMatch: highestHit,
    hits,
    decision,
    action,
    isActivationBlocked: isMatchFound,
    isPayoutBlocked: isMatchFound,
    requiresEdd,
    reasons: hits.map((h) => `Watchlist match: ${h.watchlistEntry.fullName}`),
    notes,
  };
}

/**
 * Conducts comprehensive sanctions screening across all merchant entities:
 * legal name, DBA, managing directors, and UBOs.
 */
export function screenMerchantApplicationSanctions(params: {
  legalBusinessName: string;
  dbaName?: string | undefined;
  directors: string[];
  ubos: string[];
  threshold?: number | undefined;
  sanctionedList?: SanctionEntry[] | undefined;
}): MerchantSanctionsAuditReport {
  const screeningId = generateUuidV7();
  const screenedAt = new Date().toISOString();
  const threshold = params.threshold ?? DEFAULT_SANCTIONS_SIMILARITY_THRESHOLD;

  const hits: MerchantSanctionsAuditReport['hits'] = [];

  // 1. Screen Legal Business Name
  const legalRes = screenEntityAgainstSanctions({
    entityName: params.legalBusinessName,
    threshold,
    sanctionedList: params.sanctionedList,
  });
  hits.push({ entityRole: 'merchant', entityName: params.legalBusinessName, result: legalRes });

  // 2. Screen DBA if provided
  if (params.dbaName && params.dbaName.trim().length > 0) {
    const dbaRes = screenEntityAgainstSanctions({
      entityName: params.dbaName,
      threshold,
      sanctionedList: params.sanctionedList,
    });
    hits.push({ entityRole: 'dba', entityName: params.dbaName, result: dbaRes });
  }

  // 3. Screen Directors
  for (const director of params.directors) {
    if (!director.trim()) continue;
    const dirRes = screenEntityAgainstSanctions({
      entityName: director,
      threshold,
      sanctionedList: params.sanctionedList,
    });
    hits.push({ entityRole: 'director', entityName: director, result: dirRes });
  }

  // 4. Screen UBOs
  for (const ubo of params.ubos) {
    if (!ubo.trim()) continue;
    const uboRes = screenEntityAgainstSanctions({
      entityName: ubo,
      threshold,
      sanctionedList: params.sanctionedList,
    });
    hits.push({ entityRole: 'ubo', entityName: ubo, result: uboRes });
  }

  const flaggedHits = hits.filter((h) => h.result.isMatchFound);
  const flaggedHitsCount = flaggedHits.length;

  let overallDecision: 'CLEARED' | 'INVESTIGATION_REQUIRED' | 'CONFIRMED_MATCH' = 'CLEARED';
  let isActivationBlocked = false;
  let isPayoutBlocked = false;
  let investigationCaseId: string | undefined;

  if (flaggedHitsCount > 0) {
    const hasConfirmedMatch = flaggedHits.some((h) => h.result.decision === 'CONFIRMED_MATCH');
    overallDecision = hasConfirmedMatch ? 'CONFIRMED_MATCH' : 'INVESTIGATION_REQUIRED';
    isActivationBlocked = true;
    isPayoutBlocked = true;
    investigationCaseId = `sanct_case_${screeningId.slice(0, 18)}`;
  }

  return {
    screeningId,
    overallDecision,
    isActivationBlocked,
    isPayoutBlocked,
    totalEntitiesScreened: hits.length,
    flaggedHitsCount,
    hits,
    investigationCaseId,
    screenedAt,
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
