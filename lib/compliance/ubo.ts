// path: lib/compliance/ubo.ts

import { z } from 'zod';
import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';

export interface UboOwnerInput {
  readonly fullName: string;
  readonly equityPercentage: number; // 0 to 100
  readonly dateOfBirth: string; // YYYY-MM-DD
  readonly nationality: string; // ISO 3166-1 alpha-2 or country name
  readonly taxId?: string | undefined;
  readonly isControlPerson?: boolean | undefined;
  readonly hasPhotoId?: boolean | undefined;
  readonly hasLivenessVerified?: boolean | undefined;
}

export interface UboValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly uboCount: number;
  readonly controlPersonDeclared: boolean;
  readonly totalUboEquity: number;
}

export interface UboDeclarationCertificate {
  readonly certificateId: string;
  readonly companyLegalName: string;
  readonly companyTaxId: string;
  readonly owners: readonly UboOwnerInput[];
  readonly uboCount: number;
  readonly totalUboEquity: number;
  readonly controlPerson: string;
  readonly signerTitle: string;
  readonly signedBy: string;
  readonly signedAt: string;
  readonly clientIp: string;
  readonly digitalFingerprint: string;
  readonly legalAttestation: string;
}

/**
 * Step 084.2: Enforces beneficial ownership rules (FinCEN CDD 31 CFR § 1010.230).
 * Validates:
 * 1. At least one control person is designated.
 * 2. All individuals with >= 25% equity have verified photo ID and liveness biometric challenge.
 * 3. Total declared equity does not exceed 100%.
 */
export function validateUboDeclaration(owners: readonly UboOwnerInput[]): UboValidationResult {
  const errors: string[] = [];

  if (!owners || owners.length === 0) {
    return {
      valid: false,
      errors: ['At least one beneficial owner or executive control person must be declared.'],
      uboCount: 0,
      controlPersonDeclared: false,
      totalUboEquity: 0,
    };
  }

  let totalEquity = 0;
  let totalUboEquity = 0;
  let uboCount = 0;
  let controlPersonDeclared = false;

  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i]!;

    if (!owner.fullName || owner.fullName.trim().length < 3) {
      errors.push(`Owner #${i + 1}: Legal full name is required.`);
    }

    if (owner.equityPercentage < 0 || owner.equityPercentage > 100) {
      errors.push(`Owner #${i + 1} (${owner.fullName}): Equity percentage must be between 0% and 100%.`);
    }

    totalEquity += owner.equityPercentage;

    if (owner.isControlPerson) {
      controlPersonDeclared = true;
    }

    // Ownership prong: 25% or greater equity
    if (owner.equityPercentage >= 25) {
      uboCount++;
      totalUboEquity += owner.equityPercentage;

      if (!owner.hasPhotoId) {
        errors.push(
          `UBO #${i + 1} (${owner.fullName}, ${owner.equityPercentage}% equity): Government photo ID verification is mandatory for all >= 25% beneficial owners.`
        );
      }

      if (!owner.hasLivenessVerified) {
        errors.push(
          `UBO #${i + 1} (${owner.fullName}, ${owner.equityPercentage}% equity): Biometric selfie liveness challenge verification is mandatory for all >= 25% beneficial owners.`
        );
      }

      if (!owner.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(owner.dateOfBirth)) {
        errors.push(`UBO #${i + 1} (${owner.fullName}): Valid date of birth (YYYY-MM-DD) is required.`);
      }

      if (!owner.nationality || owner.nationality.trim().length < 2) {
        errors.push(`UBO #${i + 1} (${owner.fullName}): Nationality / citizenship is required.`);
      }
    }
  }

  if (totalEquity > 100.0001) {
    errors.push(`Total declared equity (${totalEquity.toFixed(2)}%) exceeds the 100% maximum threshold.`);
  }

  if (!controlPersonDeclared) {
    errors.push(
      'At least one natural person exercising significant executive responsibility (CEO, CFO, Managing Member) must be designated under the CDD Control Prong.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    uboCount,
    controlPersonDeclared,
    totalUboEquity,
  };
}

/**
 * Step 084.3: Generates an immutable, cryptographically fingerprinted UBO legal declaration certificate.
 */
export function generateUboDeclarationCertificate(params: {
  readonly companyLegalName: string;
  readonly companyTaxId: string;
  readonly owners: readonly UboOwnerInput[];
  readonly signedBy: string;
  readonly signerTitle: string;
  readonly clientIp: string;
  readonly signedAt?: string | undefined;
}): UboDeclarationCertificate {
  const validation = validateUboDeclaration(params.owners);
  if (!validation.valid) {
    throw new Error(`Cannot generate UBO declaration certificate: ${validation.errors.join(' ')}`);
  }

  const certificateId = generateUuidV7();
  const signedAt = params.signedAt ?? new Date().toISOString();
  const controlPerson =
    params.owners.find((o) => o.isControlPerson)?.fullName ?? params.signedBy;

  const legalAttestation = `I, ${params.signedBy}, in my official capacity as ${params.signerTitle} of ${params.companyLegalName} (Tax ID: ${params.companyTaxId}), hereby formally attest under penalty of perjury that the declared beneficial ownership information is accurate, complete, and fully identifies all natural persons exercising 25% or greater equity ownership or significant executive control in accordance with FinCEN CDD Rule (31 CFR § 1010.230).`;

  const canonicalPayload = JSON.stringify({
    certificateId,
    companyLegalName: params.companyLegalName,
    companyTaxId: params.companyTaxId,
    owners: params.owners,
    signedBy: params.signedBy,
    signerTitle: params.signerTitle,
    signedAt,
    clientIp: params.clientIp,
    legalAttestation,
  });

  const digitalFingerprint = crypto
    .createHash('sha256')
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  return {
    certificateId,
    companyLegalName: params.companyLegalName,
    companyTaxId: params.companyTaxId,
    owners: params.owners,
    uboCount: validation.uboCount,
    totalUboEquity: validation.totalUboEquity,
    controlPerson,
    signerTitle: params.signerTitle,
    signedBy: params.signedBy,
    signedAt,
    clientIp: params.clientIp,
    digitalFingerprint,
    legalAttestation,
  };
}
