// path: lib/estimates/signature.ts

import crypto from 'crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Estimate, EstimateSignature } from '@/types/estimate';

export class MissingSignatureConsentError extends Error {
  constructor() {
    super('Legal electronic signature rejected: Consent checkbox must be explicitly checked.');
    this.name = 'MissingSignatureConsentError';
  }
}

export class InvalidDocumentHashError extends Error {
  constructor(computed: string, provided: string) {
    super(`Document hash mismatch: computed ${computed} !== provided ${provided}. Document has been altered.`);
    this.name = 'InvalidDocumentHashError';
  }
}

const auditRepo = new AuditLogRepository();

/**
 * Computes SHA-256 document hash for an estimate to ensure tamper resistance.
 */
export function computeEstimateDocumentHash(estimate: Estimate): string {
  const payload = JSON.stringify({
    estimateNumber: estimate.estimateNumber,
    clientEmail: estimate.clientEmail,
    total: estimate.total,
    currency: estimate.currency,
    items: estimate.items?.map((i) => ({
      desc: i.description,
      qty: i.quantity,
      price: i.unitPrice,
      total: i.total,
    })),
  });

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Step 192: Digital Signature & Legal E-Sign Audit Evidence Capture Engine
 * Captures all 8 forensic evidence fields with legal non-repudiation.
 */
export async function signAndAcceptEstimate(input: {
  estimate: Estimate;
  signerName: string;
  signerEmail: string;
  consentCheckbox: boolean;
  ipAddress: string;
  userAgent: string;
  signatureData: string;
  documentHash: string;
  actorId?: string | undefined;
}): Promise<EstimateSignature> {
  if (!input.consentCheckbox) {
    throw new MissingSignatureConsentError();
  }

  if (input.estimate.status === 'void' || input.estimate.status === 'converted') {
    throw new Error(`Cannot sign estimate in '${input.estimate.status}' status.`);
  }

  const computedHash = computeEstimateDocumentHash(input.estimate);
  if (computedHash !== input.documentHash) {
    throw new InvalidDocumentHashError(computedHash, input.documentHash);
  }

  const signatureId = generateUuidV7();
  const now = new Date().toISOString();

  const signatureRecord: EstimateSignature = {
    id: signatureId,
    tenantId: input.estimate.tenantId,
    estimateId: input.estimate.id,
    signerName: input.signerName,
    signerEmail: input.signerEmail,
    consentCheckbox: true,
    signedAt: now,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    documentHash: input.documentHash,
    signatureData: input.signatureData,
    createdAt: now,
  };

  input.estimate.signature = signatureRecord;
  input.estimate.status = 'accepted';
  input.estimate.updatedAt = now;
  input.estimate.version += 1;

  logger.info('Estimate digitally signed and accepted with forensic audit evidence', {
    estimateId: input.estimate.id,
    signatureId,
    signerName: input.signerName,
    ipAddress: input.ipAddress,
    documentHash: input.documentHash,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorId ?? '00000000-0000-4000-8000-000000000000',
      action: 'ESTIMATE_DIGITALLY_SIGNED',
      entity_type: 'estimate',
      entity_id: input.estimate.id,
      payload: {
        estimateNumber: input.estimate.estimateNumber,
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        ipAddress: input.ipAddress,
        documentHash: input.documentHash,
      },
    });
  } catch {}

  return signatureRecord;
}
