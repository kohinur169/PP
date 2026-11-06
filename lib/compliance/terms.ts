// path: lib/compliance/terms.ts

import crypto from 'node:crypto';
import { z } from 'zod';
import { AbstractRepository, EntityStorageDriver } from '@/lib/db/repository';
import { AuditLogRepository } from '@/lib/db/audit';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger';
import type { BaseEntity } from '@/types/entity';

/**
 * Standard Legal Policy Specification
 */
export interface PolicyDefinition {
  readonly slug: string;
  readonly title: string;
  readonly version: string;
  readonly effectiveDate: string;
  readonly isMandatory: boolean;
  readonly content: string;
  readonly hash: string;
}

/**
 * Deterministically computes SHA-256 hex hash of policy text content.
 */
export function hashPolicyContent(content: string): string {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Initial Default System Policies for KD SOLUTION IT PayFac
 */
const DEFAULT_POLICIES: Record<string, Omit<PolicyDefinition, 'hash'> & { content: string }> = {
  merchant_agreement: {
    slug: 'merchant_agreement',
    title: 'Master Merchant Processing Services Agreement',
    version: '2.1.0',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    isMandatory: true,
    content: `KD SOLUTION IT MASTER MERCHANT SERVICES AGREEMENT (v2.1.0)
This Merchant Processing Agreement governs all merchant payment processing services, settlement timelines, chargeback liabilities, and fiduciary reserve obligations provided by KD Solution IT Ltd. By accepting this Agreement, Merchant agrees to multi-processor routing, double-entry ledger settlement, and statutory compliance under US & EU Payment Facilitator frameworks.`,
  },
  privacy_policy: {
    slug: 'privacy_policy',
    title: 'Global Privacy & Financial Data Protection Policy',
    version: '1.5.0',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    isMandatory: true,
    content: `KD SOLUTION IT PRIVACY POLICY (v1.5.0)
We process personal and financial transaction data strictly in accordance with GDPR, CCPA, and PCI-DSS Level 1 specifications. Encryption at rest (AES-256-GCM) and hardware-backed device keys are strictly mandated for all identity verification and transaction records.`,
  },
  acceptable_use: {
    slug: 'acceptable_use',
    title: 'Prohibited Businesses & Acceptable Use Policy',
    version: '2.0.0',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    isMandatory: true,
    content: `KD SOLUTION IT ACCEPTABLE USE POLICY (v2.0.0)
Merchants are strictly prohibited from processing transactions relating to illegal substances, unauthorized debt settlement, counterfeit luxury goods, unregulated gambling, or deceptive marketing practices. Violations result in immediate payout freeze and account termination.`,
  },
  e_sign_consent: {
    slug: 'e_sign_consent',
    title: 'Electronic Signatures & Notices Consent Agreement',
    version: '1.0.0',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    isMandatory: true,
    content: `KD SOLUTION IT E-SIGN CONSENT AGREEMENT (v1.0.0)
You consent to receive all statutory disclosures, fee schedules, tax documents (1099-K), and dispute notifications electronically via our platform dashboard and verified notification emails.`,
  },
};

// Dynamic in-memory registry of active policies (supports version updates for compliance testing)
const activePolicies = new Map<string, PolicyDefinition>();

function initActivePolicies(): void {
  activePolicies.clear();
  for (const [slug, def] of Object.entries(DEFAULT_POLICIES)) {
    activePolicies.set(slug, {
      ...def,
      hash: hashPolicyContent(def.content),
    });
  }
}

initActivePolicies();

/**
 * Resets active policies to initial default versions (for test isolation).
 */
export function resetPoliciesForTest(): void {
  initActivePolicies();
}

/**
 * Retrieves an active policy definition by slug.
 */
export function getActivePolicy(slug: string): PolicyDefinition | undefined {
  return activePolicies.get(slug);
}

/**
 * Retrieves all active mandatory system policies.
 */
export function getAllActivePolicies(): PolicyDefinition[] {
  return Array.from(activePolicies.values());
}

/**
 * Updates a policy to a new version with new text content.
 * Simulates legal policy updates requiring fresh merchant re-acceptance.
 */
export function updatePolicyVersion(
  slug: string,
  newVersion: string,
  newContent: string
): PolicyDefinition {
  const existing = activePolicies.get(slug);
  if (!existing) {
    throw new Error(`Policy "${slug}" does not exist.`);
  }

  const updated: PolicyDefinition = {
    ...existing,
    version: newVersion,
    content: newContent,
    effectiveDate: new Date().toISOString(),
    hash: hashPolicyContent(newContent),
  };

  activePolicies.set(slug, updated);
  logger.info('Legal policy version updated in compliance registry', {
    slug,
    newVersion,
    hash: updated.hash,
  });

  return updated;
}

/**
 * Terms Acceptance Database Entity
 */
export interface TermsAcceptanceEntity extends BaseEntity {
  readonly company_id: string;
  readonly user_id: string;
  readonly policy_slug: string;
  readonly policy_version: string;
  readonly policy_hash: string;
  readonly accepted_at: string;
  readonly ip_address: string;
  readonly user_agent: string;
}

export const TermsAcceptanceCreateSchema = z.object({
  company_id: z.string().uuid(),
  user_id: z.string().uuid(),
  policy_slug: z.string().min(1).max(100),
  policy_version: z.string().min(1).max(50),
  policy_hash: z.string().length(64),
  accepted_at: z.string().datetime().optional(),
  ip_address: z.string().min(1).max(45),
  user_agent: z.string().min(1),
});

/**
 * Repository for Immutable Legal Terms Acceptance Records.
 */
export class TermsAcceptanceRepository extends AbstractRepository<TermsAcceptanceEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<TermsAcceptanceEntity> | undefined;
  }) {
    super('TermsAcceptance', options);
  }

  /**
   * Finds all acceptance records for a specific user.
   */
  public async findByUser(userId: string): Promise<TermsAcceptanceEntity[]> {
    return await this.findMany({
      includeDeleted: false,
    }).then((records) => records.filter((r) => r.user_id === userId));
  }

  /**
   * Finds the latest acceptance record for a user and policy slug.
   */
  public async getLatestUserAcceptance(
    userId: string,
    policySlug: string
  ): Promise<TermsAcceptanceEntity | null> {
    const records = await this.findByUser(userId);
    const matches = records
      .filter((r) => r.policy_slug === policySlug)
      .sort((a, b) => new Date(b.accepted_at).getTime() - new Date(a.accepted_at).getTime());

    return matches[0] ?? null;
  }
}

const defaultTermsRepo = new TermsAcceptanceRepository();
const defaultAuditRepo = new AuditLogRepository();

export interface RecordTermsAcceptanceOptions {
  readonly companyId?: string | undefined;
  readonly policyVersion?: string | undefined;
  readonly policyContent?: string | undefined;
  readonly termsRepo?: TermsAcceptanceRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

/**
 * Step 076.2: Records immutable acceptance of a legal terms policy.
 * Captures user_id, company_id, policy_slug, policy_version, accepted_at, ip_address,
 * user_agent, and SHA-256 hash of policy text at time of acceptance.
 */
export async function recordTermsAcceptance(
  userId: string,
  policySlug: string,
  ip: string,
  userAgent: string,
  options?: RecordTermsAcceptanceOptions
): Promise<TermsAcceptanceEntity> {
  if (!userId || userId.trim().length === 0) {
    throw new Error('User ID is required to record terms acceptance.');
  }

  if (!policySlug || policySlug.trim().length === 0) {
    throw new Error('Policy slug is required to record terms acceptance.');
  }

  if (!ip || ip.trim().length === 0) {
    throw new Error('Client IP address is required for legal audit trail.');
  }

  if (!userAgent || userAgent.trim().length === 0) {
    throw new Error('User agent is required for legal audit trail.');
  }

  const policy = getActivePolicy(policySlug);
  if (!policy) {
    throw new Error(`Unknown legal policy slug: "${policySlug}".`);
  }

  const termsRepo = options?.termsRepo ?? defaultTermsRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const companyId = options?.companyId ?? '00000000-0000-7000-8000-000000000000';
  const policyVersion = options?.policyVersion ?? policy.version;
  const policyHash = options?.policyContent
    ? hashPolicyContent(options.policyContent)
    : policy.hash;
  const acceptedAt = new Date().toISOString();

  const validated = TermsAcceptanceCreateSchema.parse({
    company_id: companyId,
    user_id: userId,
    policy_slug: policySlug,
    policy_version: policyVersion,
    policy_hash: policyHash,
    accepted_at: acceptedAt,
    ip_address: ip,
    user_agent: userAgent,
  });

  const acceptanceRecord = await termsRepo.create({
    id: generateUuidV7(),
    ...validated,
    accepted_at: acceptedAt,
  });

  // Cryptographic audit log entry
  try {
    await auditRepo.createLog({
      company_id: companyId,
      actor_id: userId,
      action: 'LEGAL_TERMS_ACCEPTED',
      entity_type: 'terms_acceptance',
      entity_id: acceptanceRecord.id,
      payload: {
        userId,
        companyId,
        policySlug,
        policyVersion,
        policyHash,
        acceptedAt,
        ipAddress: ip,
        userAgent,
      },
    });
  } catch (auditErr) {
    logger.error('Failed to log terms acceptance audit event', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  logger.info('Legal terms acceptance recorded successfully with tamper-evident audit', {
    userId,
    policySlug,
    policyVersion,
    ipAddress: ip,
    hash: policyHash,
  });

  return acceptanceRecord;
}

/**
 * Checks whether an authenticated user has accepted the latest version of a specific policy.
 */
export async function hasAcceptedLatestTerms(
  userId: string,
  policySlug: string,
  repo?: TermsAcceptanceRepository
): Promise<boolean> {
  const policy = getActivePolicy(policySlug);
  if (!policy) {
    return false;
  }

  const termsRepo = repo ?? defaultTermsRepo;
  const latestAcceptance = await termsRepo.getLatestUserAcceptance(userId, policySlug);

  if (!latestAcceptance) {
    return false;
  }

  // Must match both the version string AND policy content SHA-256 hash
  return (
    latestAcceptance.policy_version === policy.version &&
    latestAcceptance.policy_hash === policy.hash
  );
}

/**
 * Evaluates all mandatory platform policies and returns any policies
 * that have not been accepted, or where a newer version has been published.
 */
export async function getUnacceptedPolicies(
  userId: string,
  repo?: TermsAcceptanceRepository
): Promise<PolicyDefinition[]> {
  const termsRepo = repo ?? defaultTermsRepo;
  const unaccepted: PolicyDefinition[] = [];

  for (const policy of getAllActivePolicies()) {
    if (!policy.isMandatory) continue;

    const accepted = await hasAcceptedLatestTerms(userId, policy.slug, termsRepo);
    if (!accepted) {
      unaccepted.push(policy);
    }
  }

  return unaccepted;
}
