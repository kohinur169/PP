// path: lib/kyb/packet.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { encryptAesGcm, decryptAesGcm } from '@/lib/crypto/aes';
import { deriveDomainKey, zeroizeBuffer } from '@/lib/crypto/keys';
import type {
  CompanyEntityType,
  ProcessorTarget,
  KybDocumentType,
  KybDocumentItem,
  KybDocumentPacket,
  KybValidationResult,
} from '@/types/kyb';

/**
 * Computes a SHA-256 Merkle root across document content hashes.
 */
export function computeKybMerkleRoot(documentHashes: string[]): string {
  if (documentHashes.length === 0) {
    return crypto.createHash('sha256').update('EMPTY_KYB_PACKET').digest('hex');
  }

  let currentLevel = [...documentHashes].sort();

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1]! : left;
      const combined = crypto
        .createHash('sha256')
        .update(left + right, 'utf8')
        .digest('hex');
      nextLevel.push(combined);
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0]!;
}

/**
 * Pre-upload AES-256-GCM encryption for sensitive KYB corporate documentation.
 */
export function encryptAndPackageKybDocument(params: {
  id?: string | undefined;
  type: KybDocumentType;
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
  issuedDate?: string | undefined;
  expiryDate?: string | undefined;
}): KybDocumentItem {
  const docId = params.id ?? generateUuidV7();
  const sha256Hash = crypto.createHash('sha256').update(params.fileBuffer).digest('hex');

  const filesKey = deriveDomainKey('files', { context: 'kyb-packet' });
  let serializedEnvelope: string;

  try {
    const envelope = encryptAesGcm(params.fileBuffer, filesKey, {
      aad: `kyb-doc:${params.type}:${docId}`,
    });
    serializedEnvelope = envelope.serialized;
  } finally {
    zeroizeBuffer(filesKey);
  }

  return {
    id: docId,
    type: params.type,
    filename: params.filename,
    mimeType: params.mimeType,
    fileSizeBytes: params.fileBuffer.length,
    encryptedEnvelope: serializedEnvelope,
    sha256Hash,
    uploadedAt: new Date().toISOString(),
    issuedDate: params.issuedDate,
    expiryDate: params.expiryDate,
    verified: false,
  };
}

/**
 * Decrypts an encrypted KYB document and verifies plaintext integrity against its SHA-256 hash.
 */
export function decryptKybDocument(item: KybDocumentItem): Buffer {
  const filesKey = deriveDomainKey('files', { context: 'kyb-packet' });
  let decryptedString: string;

  try {
    decryptedString = decryptAesGcm(item.encryptedEnvelope, filesKey, {
      aad: `kyb-doc:${item.type}:${item.id}`,
    });
  } finally {
    zeroizeBuffer(filesKey);
  }

  const decryptedBuffer = Buffer.from(decryptedString, 'utf8');
  const computedHash = crypto.createHash('sha256').update(decryptedBuffer).digest('hex');

  if (computedHash !== item.sha256Hash) {
    throw new Error(
      `Decrypted document hash mismatch! Expected ${item.sha256Hash}, computed ${computedHash}`
    );
  }

  return decryptedBuffer;
}

/**
 * Validates KYB packet completeness against entity structure, expiration dates, and processor rules.
 */
export function validateKybPacketCompleteness(
  packet: Pick<
    KybDocumentPacket,
    'entityType' | 'targetProcessor' | 'documents' | 'legalBusinessName' | 'taxId'
  >,
  referenceDate: Date = new Date()
): KybValidationResult {
  const missingRequirements: string[] = [];
  const warnings: string[] = [];

  const docTypes = new Set(packet.documents.map((d) => d.type));

  // Entity Type Requirements
  switch (packet.entityType) {
    case 'corporation':
    case 'llc': {
      if (!docTypes.has('business_registration_certificate')) {
        missingRequirements.push(
          'Certificate of Incorporation / Articles of Organization (business_registration_certificate)'
        );
      }
      if (!docTypes.has('tax_id_certificate')) {
        missingRequirements.push(
          'Official Tax ID Confirmation / IRS CP-575 / 147C Letter (tax_id_certificate)'
        );
      }
      if (!docTypes.has('proof_of_address')) {
        missingRequirements.push(
          'Proof of Registered Address <= 90 days old (proof_of_address)'
        );
      }
      if (!docTypes.has('corporate_registry_lookup')) {
        missingRequirements.push(
          'Official Corporate Registry / Secretary of State Lookup (corporate_registry_lookup)'
        );
      }
      if (!docTypes.has('ownership_structure_chart')) {
        warnings.push('Ownership structure chart recommended for complex corporate trees.');
      }
      break;
    }
    case 'partnership': {
      if (!docTypes.has('business_registration_certificate')) {
        missingRequirements.push(
          'Business Registration Certificate (business_registration_certificate)'
        );
      }
      if (!docTypes.has('partnership_agreement')) {
        missingRequirements.push(
          'Executed Partnership Agreement (partnership_agreement)'
        );
      }
      if (!docTypes.has('tax_id_certificate')) {
        missingRequirements.push('Partnership Tax ID Letter (tax_id_certificate)');
      }
      if (!docTypes.has('proof_of_address')) {
        missingRequirements.push(
          'Proof of Registered Business Address (proof_of_address)'
        );
      }
      break;
    }
    case 'sole_proprietorship': {
      if (
        !docTypes.has('trade_license') &&
        !docTypes.has('business_registration_certificate')
      ) {
        missingRequirements.push(
          'Trade License or Registered DBA Certificate (trade_license)'
        );
      }
      if (!docTypes.has('tax_id_certificate')) {
        missingRequirements.push('Tax ID / SSN Confirmation (tax_id_certificate)');
      }
      if (!docTypes.has('proof_of_address')) {
        missingRequirements.push(
          'Proof of Operating Address <= 90 days (proof_of_address)'
        );
      }
      break;
    }
    case 'non_profit': {
      if (!docTypes.has('business_registration_certificate')) {
        missingRequirements.push('Charter / Articles of Incorporation');
      }
      if (!docTypes.has('tax_id_certificate')) {
        missingRequirements.push('Tax Exemption Determination Letter');
      }
      if (!docTypes.has('proof_of_address')) {
        missingRequirements.push('Proof of Operating Address');
      }
      break;
    }
  }

  // Address recency check (Proof of address must be <= 90 days old)
  const proofOfAddress = packet.documents.find((d) => d.type === 'proof_of_address');
  if (proofOfAddress && proofOfAddress.issuedDate) {
    const issued = new Date(proofOfAddress.issuedDate).getTime();
    const maxAgeMs = 90 * 24 * 60 * 60 * 1000;
    if (referenceDate.getTime() - issued > maxAgeMs) {
      missingRequirements.push(
        'Proof of address is older than 90 days; recent statement required.'
      );
    }
  }

  // Document expiration checks
  for (const doc of packet.documents) {
    if (doc.expiryDate) {
      const expiry = new Date(doc.expiryDate).getTime();
      if (expiry < referenceDate.getTime()) {
        missingRequirements.push(
          `Document '${doc.filename}' (${doc.type}) expired on ${doc.expiryDate}.`
        );
      }
    }
  }

  return {
    valid: missingRequirements.length === 0,
    missingRequirements,
    warnings,
  };
}

/**
 * Assembles and seals a unified KYB document packet for downstream processor dispatch.
 */
export function buildKybDocumentPacket(params: {
  tenantId: string;
  companyId: string;
  legalBusinessName: string;
  dbaName?: string | undefined;
  entityType: CompanyEntityType;
  taxId: string;
  jurisdiction: string;
  targetProcessor: ProcessorTarget;
  documents: KybDocumentItem[];
}): KybDocumentPacket {
  const packetId = generateUuidV7();
  const now = new Date().toISOString();

  const validation = validateKybPacketCompleteness(
    {
      entityType: params.entityType,
      targetProcessor: params.targetProcessor,
      documents: params.documents,
      legalBusinessName: params.legalBusinessName,
      taxId: params.taxId,
    },
    new Date(now)
  );

  const hashes = params.documents.map((d) => d.sha256Hash);
  const merkleRootHash = computeKybMerkleRoot(hashes);

  return {
    packetId,
    tenantId: params.tenantId,
    companyId: params.companyId,
    legalBusinessName: params.legalBusinessName,
    dbaName: params.dbaName,
    entityType: params.entityType,
    taxId: params.taxId,
    jurisdiction: params.jurisdiction,
    targetProcessor: params.targetProcessor,
    documents: params.documents,
    merkleRootHash,
    status: validation.valid ? 'complete' : 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
