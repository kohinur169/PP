// path: lib/kyb/ubo.ts

import crypto from 'node:crypto';
import { encryptAesGcm } from '@/lib/crypto/aes';
import { deriveDomainKey, zeroizeBuffer } from '@/lib/crypto/keys';

export const UBO_THRESHOLD_PERCENTAGE = 25.0;

export interface ResidentialAddress {
  streetAddress: string;
  city: string;
  stateOrProvince?: string | undefined;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
}

export interface BeneficialOwnerInput {
  id?: string | undefined;
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  nationality: string; // ISO 3166-1 alpha-2
  equityPercentage: number; // 0 to 100
  isDirector: boolean;
  isPrimarySignatory: boolean;
  residentialAddress: ResidentialAddress;
  idDocId?: string | undefined;
  idDocFilename?: string | undefined;
  idDocEncryptedEnvelope?: string | undefined;
  proofOfAddressDocId?: string | undefined;
  livenessStatus?: 'pending' | 'passed' | 'failed' | 'waived' | undefined;
}

export interface UboValidationIssue {
  ownerIndex?: number | undefined;
  ownerName?: string | undefined;
  field: string;
  message: string;
}

export interface UboPipelineValidationResult {
  valid: boolean;
  totalEquityPercentage: number;
  qualifyingUboCount: number;
  directorsCount: number;
  issues: UboValidationIssue[];
  remediationRequired: boolean;
}

/**
 * Returns true if an owner's equity percentage meets or exceeds the regulatory 25% UBO threshold.
 */
export function isUboThresholdMet(equityPercentage: number): boolean {
  return Number(equityPercentage) >= UBO_THRESHOLD_PERCENTAGE;
}

/**
 * Validates beneficial owner and director registry compliance.
 * Enforces FinCEN and EU 5AMLD rules:
 * - Total equity cannot exceed 100.0%.
 * - Every owner holding >= 25% equity MUST supply government-issued ID upload.
 * - Every owner holding >= 25% equity must be of legal adult age (>= 18).
 * - At least one managing director or primary signatory must be identified.
 */
export function validateUboRegistry(
  owners: BeneficialOwnerInput[],
  referenceDate: Date = new Date()
): UboPipelineValidationResult {
  const issues: UboValidationIssue[] = [];

  if (owners.length === 0) {
    return {
      valid: false,
      totalEquityPercentage: 0,
      qualifyingUboCount: 0,
      directorsCount: 0,
      issues: [
        {
          field: 'owners',
          message: 'At least one beneficial owner or corporate director must be registered.',
        },
      ],
      remediationRequired: true,
    };
  }

  let totalEquityPercentage = 0;
  let qualifyingUboCount = 0;
  let directorsCount = 0;

  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i]!;
    const equity = Number(owner.equityPercentage) || 0;
    totalEquityPercentage += equity;

    if (owner.isDirector || owner.isPrimarySignatory) {
      directorsCount++;
    }

    const isUbo = isUboThresholdMet(equity);
    if (isUbo) {
      qualifyingUboCount++;
    }

    // Name check
    if (!owner.fullName || owner.fullName.trim().length < 2) {
      issues.push({
        ownerIndex: i,
        ownerName: owner.fullName,
        field: 'fullName',
        message: `Owner #${i + 1} must have a valid full legal name.`,
      });
    }

    // Nationality check (ISO 2-letter uppercase)
    if (!owner.nationality || !/^[A-Z]{2}$/i.test(owner.nationality.trim())) {
      issues.push({
        ownerIndex: i,
        ownerName: owner.fullName,
        field: 'nationality',
        message: `Owner '${owner.fullName || `#${i + 1}`}' must specify a valid 2-letter ISO country code.`,
      });
    }

    // Date of Birth & Age Check
    if (!owner.dateOfBirth) {
      issues.push({
        ownerIndex: i,
        ownerName: owner.fullName,
        field: 'dateOfBirth',
        message: `Owner '${owner.fullName || `#${i + 1}`}' date of birth is required.`,
      });
    } else {
      const dob = new Date(owner.dateOfBirth);
      if (isNaN(dob.getTime())) {
        issues.push({
          ownerIndex: i,
          ownerName: owner.fullName,
          field: 'dateOfBirth',
          message: `Owner '${owner.fullName || `#${i + 1}`}' has invalid date of birth format.`,
        });
      } else {
        const ageYears =
          (referenceDate.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (ageYears < 18) {
          issues.push({
            ownerIndex: i,
            ownerName: owner.fullName,
            field: 'dateOfBirth',
            message: `Owner '${owner.fullName}' is a minor (${Math.floor(ageYears)} years old); UBOs and directors must be at least 18 years of age.`,
          });
        }
      }
    }

    // Residential Address Check
    const addr = owner.residentialAddress;
    if (
      !addr ||
      !addr.streetAddress?.trim() ||
      !addr.city?.trim() ||
      !addr.postalCode?.trim() ||
      !addr.country?.trim()
    ) {
      issues.push({
        ownerIndex: i,
        ownerName: owner.fullName,
        field: 'residentialAddress',
        message: `Owner '${owner.fullName || `#${i + 1}`}' must provide complete residential street address, city, postal code, and country.`,
      });
    }

    // Mandatory Document Upload for Qualifying UBO (>= 25%)
    if (isUbo) {
      const hasIdDocument = Boolean(
        (owner.idDocId && owner.idDocId.trim().length > 0) ||
          (owner.idDocEncryptedEnvelope && owner.idDocEncryptedEnvelope.trim().length > 0)
      );

      if (!hasIdDocument) {
        issues.push({
          ownerIndex: i,
          ownerName: owner.fullName,
          field: 'idDocId',
          message: `Beneficial owner '${owner.fullName}' holds ${equity.toFixed(1)}% equity (>= 25.0%) and must provide a verified government photo ID/passport document upload.`,
        });
      }

      if (owner.livenessStatus === 'failed') {
        issues.push({
          ownerIndex: i,
          ownerName: owner.fullName,
          field: 'livenessStatus',
          message: `Beneficial owner '${owner.fullName}' failed biometric liveness check. Rematch or visual KYC required.`,
        });
      }
    }
  }

  // Equity sum validation
  if (totalEquityPercentage > 100.001) {
    issues.push({
      field: 'equityPercentage',
      message: `Total declared beneficial equity cannot exceed 100.0% (declared ${totalEquityPercentage.toFixed(2)}%).`,
    });
  }

  // Managing Director / Primary Signatory Requirement
  if (directorsCount === 0) {
    issues.push({
      field: 'isDirector',
      message: 'At least one managing director or primary authorized signatory must be identified.',
    });
  }

  return {
    valid: issues.length === 0,
    totalEquityPercentage,
    qualifyingUboCount,
    directorsCount,
    issues,
    remediationRequired: issues.length > 0,
  };
}

/**
 * Pre-upload AES-256-GCM encryption for beneficial owner passports and national IDs.
 */
export function packageAndEncryptUboIdentityDoc(params: {
  ownerId: string;
  docType: 'passport' | 'national_id' | 'drivers_license';
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
}): {
  encryptedEnvelope: string;
  sha256Hash: string;
  fileSizeBytes: number;
} {
  const sha256Hash = crypto.createHash('sha256').update(params.fileBuffer).digest('hex');
  const piiKey = deriveDomainKey('pii', { context: 'ubo-identity' });
  let encryptedEnvelope: string;

  try {
    const envelope = encryptAesGcm(params.fileBuffer, piiKey, {
      aad: `ubo-id:${params.ownerId}:${params.docType}`,
    });
    encryptedEnvelope = envelope.serialized;
  } finally {
    zeroizeBuffer(piiKey);
  }

  return {
    encryptedEnvelope,
    sha256Hash,
    fileSizeBytes: params.fileBuffer.length,
  };
}
