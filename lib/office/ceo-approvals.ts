// path: lib/office/ceo-approvals.ts

import crypto from 'node:crypto';
import { z } from 'zod';
import { Role, Permission, assertPermission } from '@/lib/auth/roles';
import { signAuditEntry, verifyAuditSignature } from '@/lib/security/audit-signer';
import { CompanyRepository } from '@/lib/db/companies';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

/**
 * KYC Underwriting Packet presented to CEO for final approval.
 */
export interface KycPacket {
  readonly id: string;
  readonly companyId: string;
  readonly legalName: string;
  readonly dbaName: string;
  readonly country: string;
  readonly mcc: string;
  readonly riskTier: 1 | 2 | 3;
  readonly underwritingSummary: string;
  readonly complianceOfficerRecommendation: string;
  status: 'pending_ceo_approval' | 'approved' | 'rejected';
  submittedAt: string;
  ceoDecisionAt?: string | undefined;
  ceoSignature?: string | undefined;
  rejectionReason?: string | undefined;
}

/**
 * Joint Governance Policy Proposal (Countries, Pricing, Reserve rules).
 */
export interface GovernanceProposal {
  readonly id: string;
  readonly type: 'country_enable_disable' | 'pricing_structure';
  readonly title: string;
  readonly payload: Record<string, unknown>;
  readonly proposedBy: string;
  readonly proposedByRole: Role;
  status: 'pending_signoff' | 'active' | 'rejected';
  approvedBy?: string | undefined;
  approvedByRole?: Role | undefined;
  approvedAt?: string | undefined;
  signature?: string | undefined;
}

// In-memory stores for testing and demonstration
const kycPacketsRegistry = new Map<string, KycPacket>();
const governanceProposalsRegistry = new Map<string, GovernanceProposal>();

const DEFAULT_ALLOWED_COUNTRIES = ['US', 'SG', 'GB', 'CA', 'AU', 'EU'];
let allowedCountries = [...DEFAULT_ALLOWED_COUNTRIES];

/**
 * Resets stores for test isolation.
 */
export function resetCeoDataForTest(): void {
  kycPacketsRegistry.clear();
  governanceProposalsRegistry.clear();
  allowedCountries = [...DEFAULT_ALLOWED_COUNTRIES];
}

/**
 * Seeds a KYC packet into the CEO review registry.
 */
export function seedKycPacketForTest(packet: KycPacket): void {
  kycPacketsRegistry.set(packet.id, { ...packet });
}

/**
 * Seeds a governance proposal into the registry.
 */
export function seedGovernanceProposalForTest(proposal: GovernanceProposal): void {
  governanceProposalsRegistry.set(proposal.id, { ...proposal });
}

/**
 * Lists all KYC packets pending CEO final review.
 */
export async function listPendingKycPackets(): Promise<KycPacket[]> {
  return Array.from(kycPacketsRegistry.values());
}

/**
 * Gets a specific KYC packet by ID.
 */
export async function getKycPacketById(id: string): Promise<KycPacket | null> {
  const packet = kycPacketsRegistry.get(id);
  return packet ? { ...packet } : null;
}

export interface CeoKycSignOffParams {
  readonly packetId: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly notes?: string | undefined;
  readonly privateKey?: string | crypto.KeyObject | undefined;
  readonly companyRepo?: CompanyRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

export interface CeoKycSignOffResult {
  readonly success: boolean;
  readonly packet: KycPacket;
  readonly signature: string;
  readonly decisionHash: string;
}

/**
 * Step 067.2 & Step 067.4: CEO Digital Sign-off for Final KYC Onboarding.
 * Computes payload hash, applies Ed25519 signature, transitions company to active,
 * and records tamper-evident Ed25519 audit log.
 */
export async function executeCeoKycSignOff(
  params: CeoKycSignOffParams
): Promise<CeoKycSignOffResult> {
  const { packetId, actorId, actorRole, notes, privateKey, companyRepo, auditRepo } = params;

  // 1. Role Authorization Gate: Requires CEO role / APPROVE_KYC permission
  assertPermission(actorRole, Permission.APPROVE_KYC);

  // 2. Fetch target KYC packet
  const packet = kycPacketsRegistry.get(packetId);
  if (!packet) {
    throw new Error(`KYC packet "${packetId}" not found.`);
  }

  if (packet.status !== 'pending_ceo_approval') {
    throw new Error(`KYC packet "${packetId}" is not pending review (status: ${packet.status}).`);
  }

  const decisionTimestamp = new Date().toISOString();

  // 3. Step 067.4: Compute SHA-256 Decision Hash & Ed25519 Digital Signature
  const decisionDataToSign = JSON.stringify({
    packetId: packet.id,
    companyId: packet.companyId,
    legalName: packet.legalName,
    riskTier: packet.riskTier,
    decision: 'APPROVED',
    actorId,
    timestamp: decisionTimestamp,
    notes: notes ?? 'CEO final executive approval granted.',
  });

  const decisionHash = crypto
    .createHash('sha256')
    .update(decisionDataToSign)
    .digest('hex');

  // Sign hash using Ed25519
  const signature = signAuditEntry(decisionHash, privateKey);

  // 4. Update Packet State
  packet.status = 'approved';
  packet.ceoDecisionAt = decisionTimestamp;
  packet.ceoSignature = signature;
  kycPacketsRegistry.set(packetId, packet);

  logger.info('CEO executive KYC sign-off executed', {
    packetId: packet.id,
    companyId: packet.companyId,
    actorId,
    signatureLength: signature.length,
  });

  // 5. Unlock Sub-Merchant Company Provisioning (transition status to active)
  if (companyRepo) {
    try {
      const company = await companyRepo.findById(packet.companyId);
      if (company) {
        await companyRepo.updateStatus(packet.companyId, company.version, 'active');
        logger.info('Sub-merchant company transitioned to active status following CEO sign-off', {
          companyId: packet.companyId,
        });
      }
    } catch (compErr) {
      logger.error('Failed to update company status upon CEO sign-off', {
        error: compErr instanceof Error ? compErr.message : String(compErr),
      });
    }
  }

  // 6. Record Audit Log with Ed25519 Signature
  if (auditRepo) {
    try {
      await auditRepo.createLog({
        company_id: packet.companyId,
        actor_id: actorId,
        action: 'KYC_VERIFICATION_DECISION',
        entity_type: 'kyc_application',
        entity_id: packet.id,
        signature,
        payload: {
          decision: 'approved',
          decisionHash,
          signerRole: actorRole,
          notes: notes ?? 'CEO final approval granted.',
          riskTier: packet.riskTier,
          unlockedProvisioning: true,
        },
      });
    } catch (auditErr) {
      logger.error('Failed to record CEO KYC sign-off audit log', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }
  }

  return {
    success: true,
    packet: { ...packet },
    signature,
    decisionHash,
  };
}

/**
 * Rejects a KYC packet by CEO.
 */
export async function rejectCeoKyc(params: {
  readonly packetId: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly reason: string;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<KycPacket> {
  const { packetId, actorId, actorRole, reason, auditRepo } = params;

  assertPermission(actorRole, Permission.APPROVE_KYC);

  const packet = kycPacketsRegistry.get(packetId);
  if (!packet) {
    throw new Error(`KYC packet "${packetId}" not found.`);
  }

  packet.status = 'rejected';
  packet.ceoDecisionAt = new Date().toISOString();
  packet.rejectionReason = reason;
  kycPacketsRegistry.set(packetId, packet);

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: packet.companyId,
      actor_id: actorId,
      action: 'KYC_VERIFICATION_DECISION',
      entity_type: 'kyc_application',
      entity_id: packet.id,
      payload: {
        decision: 'rejected',
        reason,
        actor_role: actorRole,
      },
    });
  }

  return { ...packet };
}

/**
 * Step 067.3: Joint Governance - Propose a Country or Pricing Policy.
 */
export async function proposeGovernancePolicy(params: {
  readonly type: 'country_enable_disable' | 'pricing_structure';
  readonly title: string;
  readonly payload: Record<string, unknown>;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<GovernanceProposal> {
  const { type, title, payload, actorId, actorRole, auditRepo } = params;

  // Proposer must be CEO or Super Admin
  if (actorRole !== Role.CEO && actorRole !== Role.SUPER_ADMIN) {
    throw new Error(`Only CEO or Super Admin can propose joint governance policies.`);
  }

  const proposalId = `gov_${crypto.randomUUID()}`;
  const proposal: GovernanceProposal = {
    id: proposalId,
    type,
    title,
    payload,
    proposedBy: actorId,
    proposedByRole: actorRole,
    status: 'pending_signoff',
  };

  governanceProposalsRegistry.set(proposalId, proposal);

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: actorId,
      action: 'POLICY_PROPOSED',
      entity_type: 'governance_proposal',
      entity_id: proposalId,
      payload: {
        type,
        title,
        proposedByRole: actorRole,
      },
    });
  }

  return { ...proposal };
}

/**
 * Step 067.3 & Step 067.4: Joint Governance - Sign Off Policy with Four-Eye Check & Ed25519 Signature.
 */
export async function signOffGovernancePolicy(params: {
  readonly proposalId: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly privateKey?: string | crypto.KeyObject | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<GovernanceProposal> {
  const { proposalId, actorId, actorRole, privateKey, auditRepo } = params;

  // Must be CEO or Super Admin
  if (actorRole !== Role.CEO && actorRole !== Role.SUPER_ADMIN) {
    throw new Error(`Only CEO or Super Admin can sign off joint governance policies.`);
  }

  const proposal = governanceProposalsRegistry.get(proposalId);
  if (!proposal) {
    throw new Error(`Governance proposal "${proposalId}" not found.`);
  }

  if (proposal.status !== 'pending_signoff') {
    throw new Error(`Proposal "${proposalId}" is not pending sign-off.`);
  }

  // Four-Eye Enforcement: Proposer cannot approve their own proposal!
  if (proposal.proposedBy === actorId) {
    throw new Error(`Four-eye governance violation: Proposer cannot approve their own policy proposal.`);
  }

  // Complementary Role Check: If proposed by Super Admin, CEO must sign off. If proposed by CEO, Super Admin must sign off.
  if (proposal.proposedByRole === Role.SUPER_ADMIN && actorRole !== Role.CEO) {
    throw new Error(`Joint governance violation: Policy proposed by Super Admin requires CEO executive sign-off.`);
  }
  if (proposal.proposedByRole === Role.CEO && actorRole !== Role.SUPER_ADMIN) {
    throw new Error(`Joint governance violation: Policy proposed by CEO requires Super Admin confirmation.`);
  }

  const signOffTimestamp = new Date().toISOString();

  // Generate Ed25519 signature
  const policyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ proposalId, actorId, signOffTimestamp }))
    .digest('hex');

  const signature = signAuditEntry(policyHash, privateKey);

  proposal.status = 'active';
  proposal.approvedBy = actorId;
  proposal.approvedByRole = actorRole;
  proposal.approvedAt = signOffTimestamp;
  proposal.signature = signature;

  governanceProposalsRegistry.set(proposalId, proposal);

  // Apply policy if country change
  if (proposal.type === 'country_enable_disable' && Array.isArray(proposal.payload.allowedCountries)) {
    allowedCountries = proposal.payload.allowedCountries as string[];
  }

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: '00000000-0000-7000-8000-000000000000',
      actor_id: actorId,
      action: 'POLICY_APPROVED',
      entity_type: 'governance_proposal',
      entity_id: proposalId,
      signature,
      payload: {
        type: proposal.type,
        proposedBy: proposal.proposedBy,
        approvedBy: actorId,
        approvedByRole: actorRole,
      },
    });
  }

  return { ...proposal };
}

/**
 * Retrieves current allowed operating countries.
 */
export function getAllowedOperatingCountries(): string[] {
  return [...allowedCountries];
}
