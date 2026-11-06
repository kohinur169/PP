// path: lib/compliance/aml.ts

import { z } from 'zod';
import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';

export type AmlRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AmlDecisionAction = 'APPROVE' | 'FLAG_FOR_REVIEW' | 'BLOCK_AND_HOLD';

export interface AmlRedFlag {
  code: string;
  category: 'STRUCTURING' | 'VELOCITY' | 'SELF_DEALING' | 'SANCTIONED_GEO' | 'CARD_TESTING' | 'REFUND_ARBITRAGE';
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  points: number;
}

export interface AmlTransactionEvaluationInput {
  merchantId: string;
  transactionAmountUsd: number;
  monthlyDeclaredVolumeUsd: number;
  monthlyCurrentVolumeUsd: number;
  recentTransactionsLastHourCount: number;
  cardholderName?: string;
  merchantUboNames?: string[];
  isRefundToDifferentMethod?: boolean;
  originCountry?: string;
  sanctionedCountriesList?: string[];
}

export interface AmlEvaluationResult {
  evaluationId: string;
  evaluatedAt: string;
  merchantId: string;
  riskScore: number;
  riskLevel: AmlRiskLevel;
  action: AmlDecisionAction;
  redFlags: AmlRedFlag[];
  sarFilingRecommended: boolean;
  summary: string;
}

export interface AmlPolicyAttestationInput {
  companyId: string;
  companyLegalName: string;
  acknowledgedByUserId: string;
  acknowledgedByFullName: string;
  signerTitle: string;
  clientIp: string;
  policyVersion?: string;
}

export interface AmlAttestationRecord {
  attestationId: string;
  companyId: string;
  companyLegalName: string;
  acknowledgedByUserId: string;
  acknowledgedByFullName: string;
  signerTitle: string;
  clientIp: string;
  policyVersion: string;
  attestedAt: string;
  legalAttestationText: string;
  digitalFingerprint: string;
}

/**
 * Standard Sanctioned & High-Risk Country Codes (FATF Blacklist / OFAC Core).
 */
export const DEFAULT_HIGH_RISK_COUNTRIES = ['IR', 'KP', 'SY', 'CU', 'RU', 'MM'];

/**
 * Evaluates a transaction or merchant batch against Platform AML Red Flag Heuristics.
 */
export function evaluateAmlRisk(
  input: AmlTransactionEvaluationInput
): AmlEvaluationResult {
  const evaluationId = generateUuidV7();
  const evaluatedAt = new Date().toISOString();
  const redFlags: AmlRedFlag[] = [];
  const sanctionedCountries = input.sanctionedCountriesList ?? DEFAULT_HIGH_RISK_COUNTRIES;

  // 1. Structuring Detection: Just below FinCEN $10,000 threshold ($9,000 - $9,999) or $3,000 recordkeeping rule
  if (input.transactionAmountUsd >= 9000 && input.transactionAmountUsd < 10000) {
    redFlags.push({
      code: 'AML_STRUC_10K',
      category: 'STRUCTURING',
      description: 'Transaction amount ($9,000 - $9,999) falls in the FinCEN $10,000 CTR avoidance band.',
      severity: 'HIGH',
      points: 35,
    });
  } else if (input.transactionAmountUsd >= 2800 && input.transactionAmountUsd < 3000) {
    redFlags.push({
      code: 'AML_STRUC_3K',
      category: 'STRUCTURING',
      description: 'Transaction amount falls in the $3,000 BSA travel rule recordkeeping avoidance threshold.',
      severity: 'MEDIUM',
      points: 20,
    });
  }

  // 2. Velocity Spike: Volume exceeds 300% of declared underwriting monthly volume
  if (input.monthlyDeclaredVolumeUsd > 0) {
    const projectedVolume = input.monthlyCurrentVolumeUsd + input.transactionAmountUsd;
    const volumeRatio = projectedVolume / input.monthlyDeclaredVolumeUsd;
    if (volumeRatio >= 3.0) {
      redFlags.push({
        code: 'AML_VEL_SPIKE',
        category: 'VELOCITY',
        description: `Monthly volume (${Math.round(volumeRatio * 100)}% of declared cap) exceeds 300% velocity surge threshold.`,
        severity: 'CRITICAL',
        points: 40,
      });
    }
  }

  // 3. Card Testing Attack: High frequency of transactions in a short window
  if (input.recentTransactionsLastHourCount > 60) {
    redFlags.push({
      code: 'AML_CARD_TESTING',
      category: 'CARD_TESTING',
      description: `Excessive transaction velocity (${input.recentTransactionsLastHourCount} charges/hour) indicates bot testing or smurfing.`,
      severity: 'HIGH',
      points: 30,
    });
  }

  // 4. Round-Tripping / Self-Dealing: Cardholder matches declared Merchant UBO or Executive
  if (input.cardholderName && input.merchantUboNames && input.merchantUboNames.length > 0) {
    const normalizedCardholder = input.cardholderName.toLowerCase().trim();
    const isSelfDealing = input.merchantUboNames.some((ubo) => {
      const normalizedUbo = ubo.toLowerCase().trim();
      return (
        normalizedCardholder === normalizedUbo ||
        (normalizedCardholder.includes(normalizedUbo) && normalizedUbo.length > 4)
      );
    });

    if (isSelfDealing) {
      redFlags.push({
        code: 'AML_SELF_DEAL',
        category: 'SELF_DEALING',
        description: `Cardholder name (${input.cardholderName}) matches declared Merchant beneficial owner. Prohibited self-processing.`,
        severity: 'CRITICAL',
        points: 50,
      });
    }
  }

  // 5. Refund Arbitrage: Charge processed on card, refund directed to different rail/crypto
  if (input.isRefundToDifferentMethod) {
    redFlags.push({
      code: 'AML_REFUND_ARBITRAGE',
      category: 'REFUND_ARBITRAGE',
      description: 'Refund requested to alternative payment method or destination. Prohibited money extraction typology.',
      severity: 'HIGH',
      points: 35,
    });
  }

  // 6. Geographic Sanctions Nexus
  if (input.originCountry && sanctionedCountries.includes(input.originCountry.toUpperCase())) {
    redFlags.push({
      code: 'AML_SANCTIONED_GEO',
      category: 'SANCTIONED_GEO',
      description: `Transaction origin country (${input.originCountry}) is on the active sanctions or FATF blacklist.`,
      severity: 'CRITICAL',
      points: 60,
    });
  }

  // Compute Total Risk Score (Capped at 100)
  const totalPoints = redFlags.reduce((sum, rf) => sum + rf.points, 0);
  const riskScore = Math.min(100, totalPoints);

  let riskLevel: AmlRiskLevel = 'LOW';
  let action: AmlDecisionAction = 'APPROVE';
  let sarFilingRecommended = false;

  if (riskScore >= 75) {
    riskLevel = 'CRITICAL';
    action = 'BLOCK_AND_HOLD';
    sarFilingRecommended = true;
  } else if (riskScore >= 45) {
    riskLevel = 'HIGH';
    action = 'FLAG_FOR_REVIEW';
    sarFilingRecommended = redFlags.some((rf) => rf.severity === 'CRITICAL');
  } else if (riskScore >= 20) {
    riskLevel = 'MEDIUM';
    action = 'FLAG_FOR_REVIEW';
  } else {
    riskLevel = 'LOW';
    action = 'APPROVE';
  }

  const summary =
    redFlags.length === 0
      ? 'Transaction cleared all automated AML heuristics. No suspicious activity detected.'
      : `Detected ${redFlags.length} red flag indicator(s). Risk score ${riskScore}/100. Action: ${action}.`;

  return {
    evaluationId,
    evaluatedAt,
    merchantId: input.merchantId,
    riskScore,
    riskLevel,
    action,
    redFlags,
    sarFilingRecommended,
    summary,
  };
}

/**
 * Generates an immutable, cryptographically signed merchant AML/CFT policy attestation record.
 */
export function recordAmlPolicyAttestation(
  input: AmlPolicyAttestationInput
): AmlAttestationRecord {
  const attestationId = generateUuidV7();
  const attestedAt = new Date().toISOString();
  const policyVersion = input.policyVersion ?? '1.0';

  const legalAttestationText = `I, ${input.acknowledgedByFullName}, in my official capacity as ${input.signerTitle} of ${input.companyLegalName}, hereby formally certify that our organization has read, understood, and unconditionally agrees to comply with the KD Solution IT Anti-Money Laundering (AML) & Counter-Terrorist Financing (CFT) Policy (v${policyVersion}). We attest that our merchant account will not be utilized for transaction structuring, round-tripping, smurfing, unlicensed money transmission, or prohibited cash-equivalent extraction in accordance with the Bank Secrecy Act and international standards.`;

  const canonicalPayload = JSON.stringify({
    attestationId,
    companyId: input.companyId,
    companyLegalName: input.companyLegalName,
    acknowledgedByUserId: input.acknowledgedByUserId,
    acknowledgedByFullName: input.acknowledgedByFullName,
    signerTitle: input.signerTitle,
    clientIp: input.clientIp,
    policyVersion,
    attestedAt,
    legalAttestationText,
  });

  const digitalFingerprint = crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  return {
    attestationId,
    companyId: input.companyId,
    companyLegalName: input.companyLegalName,
    acknowledgedByUserId: input.acknowledgedByUserId,
    acknowledgedByFullName: input.acknowledgedByFullName,
    signerTitle: input.signerTitle,
    clientIp: input.clientIp,
    policyVersion,
    attestedAt,
    legalAttestationText,
    digitalFingerprint,
  };
}
