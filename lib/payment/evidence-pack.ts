// path: lib/payment/evidence-pack.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { getDispute } from '@/lib/payment/dispute';

export type EvidencePackStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved_and_dispatched'
  | 'rejected_by_compliance';

export interface InvoiceEvidence {
  invoiceId: string;
  invoiceNumber: string;
  lineItems: Array<{ description: string; quantity: number; amount: string }>;
  totalAmount: string;
  billedCustomerName: string;
  billedCustomerEmail: string;
  billedAt: string;
}

export interface DeliveryProofEvidence {
  deliveryType: 'physical_shipping' | 'digital_download' | 'service_rendered';
  carrier?: string | undefined;
  trackingNumber?: string | undefined;
  deliveredAt: string;
  recipientSignatureOrConfirmation?: string | undefined;
  deliveryAddressOrIp: string;
}

export interface ClientCommunicationEvidence {
  communicationChannel: 'email' | 'chat' | 'ticket' | 'phone';
  summary: string;
  messages: Array<{ sender: 'merchant' | 'customer'; timestamp: string; content: string }>;
}

export interface TermsAcceptanceEvidence {
  policyVersion: string;
  acceptedAt: string;
  customerIp: string;
  termsUrl: string;
  cancellationPolicySummary: string;
}

export interface DisputeEvidencePackRecord {
  id: string;
  tenantId: string;
  companyId: string;
  disputeId: string;
  rebuttalSummary: string;
  invoiceData: InvoiceEvidence;
  deliveryProof: DeliveryProofEvidence;
  communicationRecord: ClientCommunicationEvidence;
  termsAcceptance: TermsAcceptanceEvidence;
  additionalDocuments: string[];
  status: EvidencePackStatus;
  submittedBy: string;
  reviewedBy?: string | undefined;
  reviewedAt?: string | undefined;
  complianceNotes?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitEvidencePackInput {
  tenantId: string;
  companyId: string;
  disputeId: string;
  rebuttalSummary: string;
  invoiceData: InvoiceEvidence;
  deliveryProof: DeliveryProofEvidence;
  communicationRecord: ClientCommunicationEvidence;
  termsAcceptance: TermsAcceptanceEvidence;
  additionalDocuments?: string[] | undefined;
  submittedBy: string;
}

export interface ReviewEvidencePackInput {
  evidencePackId: string;
  reviewerId: string;
  reviewerRole: string;
  action: 'approve_and_dispatch' | 'reject_back_to_merchant';
  complianceNotes?: string | undefined;
}

const evidencePackStore = new Map<string, DisputeEvidencePackRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 144.1: Assembles and validates structured chargeback evidence pack.
 * Section 19: "A structured chargeback evidence pack is assembled: invoice, delivery proof,
 * client communication record and terms acceptance record."
 */
export async function assembleAndSubmitEvidencePack(
  input: SubmitEvidencePackInput
): Promise<DisputeEvidencePackRecord> {
  const dispute = await getDispute(input.disputeId);
  if (!dispute) {
    throw new Error(`Dispute with ID '${input.disputeId}' was not found.`);
  }

  if (dispute.status === 'expired' || dispute.status === 'lost') {
    throw new Error(
      `Cannot submit evidence for dispute '${input.disputeId}': Status is '${dispute.status}'. Response deadline has passed.`
    );
  }

  // Validate all 4 mandatory evidence artifacts are complete
  if (!input.rebuttalSummary || input.rebuttalSummary.trim().length < 20) {
    throw new Error('Merchant rebuttal summary is required (minimum 20 characters).');
  }

  if (!input.invoiceData || !input.invoiceData.invoiceNumber || !input.invoiceData.totalAmount) {
    throw new Error('Complete invoice evidence record is mandatory.');
  }

  if (!input.deliveryProof || !input.deliveryProof.deliveredAt || !input.deliveryProof.deliveryAddressOrIp) {
    throw new Error('Complete proof of delivery evidence record is mandatory.');
  }

  if (!input.communicationRecord || !input.communicationRecord.messages || input.communicationRecord.messages.length === 0) {
    throw new Error('Client communication history record is mandatory.');
  }

  if (!input.termsAcceptance || !input.termsAcceptance.acceptedAt || !input.termsAcceptance.customerIp) {
    throw new Error('Terms and conditions acceptance record with customer timestamp and IP is mandatory.');
  }

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: DisputeEvidencePackRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    disputeId: input.disputeId,
    rebuttalSummary: input.rebuttalSummary.trim(),
    invoiceData: input.invoiceData,
    deliveryProof: input.deliveryProof,
    communicationRecord: input.communicationRecord,
    termsAcceptance: input.termsAcceptance,
    additionalDocuments: input.additionalDocuments ?? [],
    status: 'under_review',
    submittedBy: input.submittedBy,
    createdAt: now,
    updatedAt: now,
  };

  evidencePackStore.set(id, record);

  // Transition dispute status to 'under_review'
  dispute.status = 'under_review';
  dispute.updatedAt = now;

  logger.info('Structured chargeback evidence pack assembled and submitted for compliance review', {
    evidencePackId: id,
    disputeId: input.disputeId,
    companyId: input.companyId,
    deliveryType: input.deliveryProof.deliveryType,
  });

  try {
    await auditRepo.append({
      actor_id: input.submittedBy,
      action: 'DISPUTE_EVIDENCE_PACK_SUBMITTED',
      entity_type: 'dispute_evidence_pack',
      entity_id: id,
      payload: {
        disputeId: input.disputeId,
        companyId: input.companyId,
        invoiceNumber: input.invoiceData.invoiceNumber,
        deliveryType: input.deliveryProof.deliveryType,
        trackingNumber: input.deliveryProof.trackingNumber ?? null,
        status: 'under_review',
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for evidence pack submission', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 144.2: Compliance Review & Processor Dispatch.
 * Section 19: "compliance_kyc reviews the evidence pack and sends it to the processor."
 */
export async function reviewAndDispatchEvidencePack(
  input: ReviewEvidencePackInput
): Promise<DisputeEvidencePackRecord> {
  // Only compliance_kyc and super_admin are authorized to review dispute evidence
  if (input.reviewerRole !== 'compliance_kyc' && input.reviewerRole !== 'super_admin') {
    throw new Error(
      `Unauthorized: Role '${input.reviewerRole}' cannot review dispute evidence packs. Allowed roles: compliance_kyc, super_admin.`
    );
  }

  const evidencePack = evidencePackStore.get(input.evidencePackId);
  if (!evidencePack) {
    throw new Error(`Evidence pack with ID '${input.evidencePackId}' was not found.`);
  }

  const dispute = await getDispute(evidencePack.disputeId);
  if (!dispute) {
    throw new Error(`Associated dispute '${evidencePack.disputeId}' was not found.`);
  }

  const now = new Date().toISOString();

  if (input.action === 'approve_and_dispatch') {
    evidencePack.status = 'approved_and_dispatched';
    evidencePack.reviewedBy = input.reviewerId;
    evidencePack.reviewedAt = now;
    evidencePack.complianceNotes = input.complianceNotes;
    evidencePack.updatedAt = now;

    // Transition dispute status to 'evidence_submitted'
    dispute.status = 'evidence_submitted';
    dispute.evidenceSubmittedAt = now;
    dispute.updatedAt = now;

    logger.info('Compliance KYC approved and dispatched dispute evidence pack to processor', {
      evidencePackId: evidencePack.id,
      disputeId: dispute.id,
      reviewerId: input.reviewerId,
      reviewerRole: input.reviewerRole,
    });

    try {
      await auditRepo.append({
        actor_id: input.reviewerId,
        action: 'DISPUTE_EVIDENCE_DISPATCHED_TO_PROCESSOR',
        entity_type: 'dispute_evidence_pack',
        entity_id: evidencePack.id,
        payload: {
          disputeId: dispute.id,
          reviewerRole: input.reviewerRole,
          status: 'approved_and_dispatched',
          disputeStatus: 'evidence_submitted',
        },
      });
    } catch (err: unknown) {
      logger.warn('Failed to append audit log for evidence dispatch', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    // Rejected back to merchant for remediation
    evidencePack.status = 'rejected_by_compliance';
    evidencePack.reviewedBy = input.reviewerId;
    evidencePack.reviewedAt = now;
    evidencePack.complianceNotes = input.complianceNotes ?? 'Evidence pack rejected by compliance review. Missing required artifacts.';
    evidencePack.updatedAt = now;

    dispute.status = 'needs_response';
    dispute.updatedAt = now;

    logger.warn('Compliance KYC rejected evidence pack back to merchant', {
      evidencePackId: evidencePack.id,
      disputeId: dispute.id,
      reason: evidencePack.complianceNotes,
    });

    try {
      await auditRepo.append({
        actor_id: input.reviewerId,
        action: 'DISPUTE_EVIDENCE_REJECTED_BY_COMPLIANCE',
        entity_type: 'dispute_evidence_pack',
        entity_id: evidencePack.id,
        payload: {
          disputeId: dispute.id,
          reviewerRole: input.reviewerRole,
          complianceNotes: evidencePack.complianceNotes,
          status: 'rejected_by_compliance',
        },
      });
    } catch (err: unknown) {
      logger.warn('Failed to append audit log for evidence rejection', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return evidencePack;
}

/**
 * Retrieves an evidence pack by ID.
 */
export async function getEvidencePack(
  evidencePackId: string
): Promise<DisputeEvidencePackRecord | null> {
  return evidencePackStore.get(evidencePackId) ?? null;
}

/**
 * Retrieves the evidence pack for a dispute ID.
 */
export async function getEvidencePackForDispute(
  disputeId: string
): Promise<DisputeEvidencePackRecord | null> {
  for (const pack of evidencePackStore.values()) {
    if (pack.disputeId === disputeId) {
      return pack;
    }
  }
  return null;
}

/**
 * Resets the in-memory evidence pack store for test isolation.
 */
export function resetEvidencePackStore(): void {
  evidencePackStore.clear();
}
