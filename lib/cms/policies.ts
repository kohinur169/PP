// path: lib/cms/policies.ts

import { z } from 'zod';
import { AbstractRepository, EntityStorageDriver, InMemoryStorageDriver } from '@/lib/db/repository';
import { AuditLogRepository } from '@/lib/db/audit';
import { Role } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';
import { BaseEntity, EntityNotFoundError, OptimisticLockError, UpdateEntityInput } from '@/types/entity';

export interface PolicyEntity extends BaseEntity {
  readonly slug: string;
  readonly title: string;
  readonly category: string;
  readonly content_md: string;
  readonly policy_version: number;
  readonly effective_date: string;
  readonly is_published: boolean;
  readonly published_at: string;
  readonly created_by: string | null;
  readonly change_summary: string | null;
}

export const PolicyCreateSchema = z.object({
  slug: z.string().min(2).max(100),
  title: z.string().min(3).max(255),
  category: z.string().default('legal'),
  content_md: z.string().min(10),
  policy_version: z.number().int().positive().default(1),
  effective_date: z.string().datetime(),
  is_published: z.boolean().default(true),
  published_at: z.string().datetime(),
  created_by: z.string().uuid().nullable().optional().default(null),
  change_summary: z.string().nullable().optional().default(null),
});

export type CreatePolicyInput = {
  readonly slug: string;
  readonly title: string;
  readonly category?: string | undefined;
  readonly content_md: string;
  readonly policy_version?: number | undefined;
  readonly effective_date?: string | undefined;
  readonly is_published?: boolean | undefined;
  readonly published_at?: string | undefined;
  readonly created_by?: string | null | undefined;
  readonly change_summary?: string | null | undefined;
  readonly id?: string | undefined;
  readonly company_id?: string | undefined;
};

const sharedPolicyDriver = new InMemoryStorageDriver<PolicyEntity>();

/**
 * Resets the in-memory store for isolated unit tests.
 */
export function clearPolicyStore(): void {
  sharedPolicyDriver.clear();
}

export const DEFAULT_PLATFORM_COMPANY_ID = '00000000-0000-7000-8000-000000000000';

/**
 * Repository for CMS Legal Policies.
 */
export class PolicyRepository extends AbstractRepository<PolicyEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<PolicyEntity> | undefined;
  }) {
    super('Policy', {
      defaultCompanyId: options?.defaultCompanyId ?? DEFAULT_PLATFORM_COMPANY_ID,
      driver: options?.driver ?? sharedPolicyDriver,
    });
  }

  public override async create(input: CreatePolicyInput): Promise<PolicyEntity> {
    const now = new Date().toISOString();
    return super.create({
      slug: input.slug.trim().toLowerCase(),
      title: input.title.trim(),
      category: input.category ?? 'legal',
      content_md: input.content_md,
      policy_version: input.policy_version ?? 1,
      effective_date: input.effective_date ?? now,
      is_published: input.is_published ?? true,
      published_at: input.published_at ?? now,
      created_by: input.created_by ?? null,
      change_summary: input.change_summary ?? null,
      id: input.id,
      company_id: input.company_id,
    });
  }

  public override async update(
    id: string,
    expectedVersion: number,
    input: UpdateEntityInput<PolicyEntity>
  ): Promise<PolicyEntity> {
    const current = await this.driver.findById(id);
    if (!current) {
      throw new EntityNotFoundError(this.entityName, id);
    }
    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(id, expectedVersion, current.version);
    }
    const now = new Date().toISOString();
    const updatedRecord = {
      ...current,
      ...input,
      id: current.id,
      company_id: current.company_id,
      created_at: current.created_at,
      updated_at: now,
      version: current.version + 1,
    } as PolicyEntity;
    return await this.driver.update(updatedRecord);
  }

  /**
   * Retrieves the current highest active published version of a policy.
   */
  public async getActivePolicyBySlug(slug: string): Promise<PolicyEntity | null> {
    const slugNormalized = slug.trim().toLowerCase();
    const all = await this.findMany({ includeDeleted: false });
    const matches = all.filter((p) => p.slug === slugNormalized && p.is_published);
    if (matches.length === 0) {
      return null;
    }
    matches.sort((a, b) => b.policy_version - a.policy_version);
    return matches[0]!;
  }

  /**
   * Retrieves a specific version of a policy document.
   */
  public async getPolicyBySlugAndVersion(
    slug: string,
    version: number
  ): Promise<PolicyEntity | null> {
    const slugNormalized = slug.trim().toLowerCase();
    const all = await this.findMany({ includeDeleted: false });
    return (
      all.find((p) => p.slug === slugNormalized && p.policy_version === version) ?? null
    );
  }

  /**
   * Retrieves all versions of a policy sorted descending.
   */
  public async getPolicyVersionHistory(slug: string): Promise<PolicyEntity[]> {
    const slugNormalized = slug.trim().toLowerCase();
    const all = await this.findMany({ includeDeleted: false });
    return all
      .filter((p) => p.slug === slugNormalized)
      .sort((a, b) => b.policy_version - a.policy_version);
  }

  /**
   * Retrieves latest published version for all distinct policy slugs.
   */
  public async getAllActivePolicies(): Promise<PolicyEntity[]> {
    const all = await this.findMany({ includeDeleted: false });
    const published = all.filter((p) => p.is_published);
    const bySlug = new Map<string, PolicyEntity>();

    for (const p of published) {
      const existing = bySlug.get(p.slug);
      if (!existing || p.policy_version > existing.policy_version) {
        bySlug.set(p.slug, p);
      }
    }

    return Array.from(bySlug.values()).sort((a, b) => a.title.localeCompare(b.title));
  }
}

const defaultPolicyRepo = new PolicyRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Standard legal policy seed documents for KD Solution IT platform.
 */
export const SEED_POLICIES: readonly Omit<
  CreatePolicyInput,
  'id' | 'company_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'version'
>[] = [
  {
    slug: 'terms-of-service',
    title: 'KD Solution IT Merchant Services Terms of Service',
    category: 'legal',
    policy_version: 1,
    content_md: `# KD Solution IT Merchant Services Terms of Service

## 1. Introduction and Scope
These Merchant Terms of Service ("Terms") govern access to and use of the payment processing, billing, and merchant aggregation platform provided by KD Solution IT ("Company", "we", "us"). By registering an account or processing payment volume, you agree to these Terms.

## 2. Multi-Tenant Processing & Gateway Redundancy
KD Solution IT integrates multiple Tier-1 payment processors (including NMI with Collect.js, Payoneer, Rainforest, Stripe Connect, and Airwallex). Transactions are routed in strict compliance with processor rules and card brand mandates.

## 3. Fiduciary Segregation & Anti-Commingling
Merchant payout funds are held in strictly segregated custodial fiduciary accounts. KD Solution IT maintains dedicated operating reserves and does not commingle corporate operating funds with merchant settlement liabilities.

## 4. Prohibited Businesses & Sanctions Compliance
Merchants are strictly prohibited from processing transactions involving OFAC-sanctioned jurisdictions (e.g., North Korea, Iran, Cuba, Syria) or illegal card-not-present merchant categories.`,
    change_summary: 'Initial production baseline terms of service (v1).',
  },
  {
    slug: 'privacy-policy',
    title: 'KD Solution IT Platform Privacy & Data Protection Policy',
    category: 'legal',
    policy_version: 1,
    content_md: `# KD Solution IT Privacy & Data Protection Policy

## 1. Data Processing Principles
KD Solution IT adheres to strict international data privacy standards, including GDPR, CCPA, and PCI-DSS Level 1.

## 2. Zero Unencrypted Card Data Retention
In compliance with PCI-DSS SAQ-A requirements, cardholder account numbers (PAN), CVVs, and magnetic stripe tracks never touch KD Solution IT server memory or persistent databases. Client-side Collect.js tokenization is mandatory.

## 3. Cryptographic Storage & Audit Integrity
All sensitive merchant business credentials and banking details are encrypted at rest using AES-256-GCM with hardware-backed envelope keys. Ed25519 hash-chained append-only logs track every administrative mutation.`,
    change_summary: 'Initial production privacy policy (v1).',
  },
  {
    slug: 'kyc-kyb-policy',
    title: 'KD Solution IT Customer & Merchant Due Diligence (KYC/KYB) Policy',
    category: 'compliance',
    policy_version: 1,
    content_md: `# KD Solution IT Customer & Merchant Due Diligence (KYC/KYB) Policy

## 1. Know Your Business (KYB) Verification Standards
Before payment settlement capabilities or gateway access are activated, all merchant legal entities must provide verified government incorporation certificates, business tax IDs (EIN/VAT), and registered operating addresses.

## 2. Ultimate Beneficial Owner (UBO) Identification
Individuals holding 25% or greater direct or indirect equity interest in the merchant entity must complete Know Your Customer (KYC) identity verification, including government photo ID and liveness checks.

## 3. Ongoing Sanctions & PEP Screening
Automated daily batch scans cross-reference all merchant principals against OFAC SDN, UN Consolidated, and EU sanctions lists. Any positive match triggers an immediate automated gateway freeze.`,
    change_summary: 'Initial production KYC/KYB regulatory policy (v1).',
  },
  {
    slug: 'acceptable-use-policy',
    title: 'KD Solution IT Acceptable Use & Prohibited Merchant Categories Policy',
    category: 'compliance',
    policy_version: 1,
    content_md: `# KD Solution IT Acceptable Use Policy

## 1. Prohibited Merchant Categories
KD Solution IT strictly prohibits the sale of illegal goods, unlicensed firearms, counterfeit trademarked merchandise, and unauthorized pharmaceutical products.

## 2. High-Risk Fulfilment & Rolling Reserves
High-risk merchants (Risk Tier 3) are subject to mandatory rolling reserves (e.g. 10% held for 180 days) and automated delivery confirmation gating before payout release.`,
    change_summary: 'Initial production acceptable use policy (v1).',
  },
];

/**
 * Ensures baseline policies are seeded in the database.
 */
export async function seedPolicyCatalog(
  repo: PolicyRepository = defaultPolicyRepo
): Promise<void> {
  const existing = await repo.findMany({ includeDeleted: false });
  if (existing.length > 0) {
    return;
  }

  for (const policy of SEED_POLICIES) {
    await repo.create({
      company_id: DEFAULT_PLATFORM_COMPANY_ID,
      ...policy,
    });
  }
}

/**
 * Computes a lightweight diff summary between two text revisions.
 */
export function computeSimpleDiff(
  oldText: string,
  newText: string
): {
  readonly additions: number;
  readonly deletions: number;
  readonly diffSummary: string;
} {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  let additions = 0;
  let deletions = 0;

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  for (const line of newLines) {
    if (!oldSet.has(line)) additions++;
  }
  for (const line of oldLines) {
    if (!newSet.has(line)) deletions++;
  }

  return {
    additions,
    deletions,
    diffSummary: `+${additions} line(s), -${deletions} line(s)`,
  };
}

/**
 * Step 082.2 & Step 082.4: Publishes an updated policy version.
 * Increments version, preserves audit diff, and triggers re-acceptance requirement.
 */
export async function publishPolicyUpdate(
  params: {
    readonly slug: string;
    readonly title: string;
    readonly contentMd: string;
    readonly category?: string | undefined;
    readonly changeSummary?: string | undefined;
    readonly actorId: string;
    readonly actorRole: Role;
  },
  options?: {
    readonly repo?: PolicyRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<{
  readonly policy: PolicyEntity;
  readonly previousVersion: number | null;
  readonly newVersion: number;
  readonly diff: { additions: number; deletions: number; diffSummary: string };
}> {
  const repo = options?.repo ?? defaultPolicyRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const slug = params.slug.trim().toLowerCase();

  if (params.actorRole !== Role.SUPER_ADMIN) {
    throw new Error('Unauthorized policy edit: Only Super Admin can publish legal policy updates.');
  }

  await seedPolicyCatalog(repo);
  const currentActive = await repo.getActivePolicyBySlug(slug);

  const previousVersion = currentActive ? currentActive.policy_version : null;
  const newVersion = currentActive ? currentActive.policy_version + 1 : 1;
  const oldContent = currentActive ? currentActive.content_md : '';
  const diff = computeSimpleDiff(oldContent, params.contentMd);

  const now = new Date().toISOString();
  const policy = await repo.create({
    slug,
    title: params.title.trim(),
    category: params.category ?? currentActive?.category ?? 'legal',
    content_md: params.contentMd,
    policy_version: newVersion,
    effective_date: now,
    is_published: true,
    published_at: now,
    created_by: params.actorId,
    change_summary: params.changeSummary ?? `Version ${newVersion} published by Super Admin.`,
  });

  // Step 082.4: Audit log every policy edit capturing diff and editor ID
  try {
    await auditRepo.createLog({
      company_id: DEFAULT_PLATFORM_COMPANY_ID,
      actor_id: params.actorId,
      action: 'POLICY_VERSION_PUBLISHED',
      entity_type: 'policies',
      entity_id: policy.id,
      payload: {
        slug,
        title: policy.title,
        previousVersion,
        newVersion,
        diffSummary: diff.diffSummary,
        additions: diff.additions,
        deletions: diff.deletions,
        changeSummary: policy.change_summary,
        editorId: params.actorId,
        effectiveDate: policy.effective_date,
      },
    });
  } catch (err) {
    logger.error('Failed to audit log policy publication', { error: err });
  }

  logger.info('Legal policy version published successfully', {
    slug,
    previousVersion,
    newVersion,
    editorId: params.actorId,
  });

  return {
    policy,
    previousVersion,
    newVersion,
    diff,
  };
}

/**
 * Checks if a merchant must re-accept a given policy because a newer version has been published.
 */
export async function checkMerchantPolicyReacceptanceRequired(
  merchantAcceptedVersion: number | null | undefined,
  policySlug: string,
  repo: PolicyRepository = defaultPolicyRepo
): Promise<{
  readonly required: boolean;
  readonly activeVersion: number;
  readonly acceptedVersion: number | null;
  readonly activePolicy: PolicyEntity;
}> {
  await seedPolicyCatalog(repo);
  const active = await repo.getActivePolicyBySlug(policySlug);
  if (!active) {
    throw new Error(`Policy with slug "${policySlug}" was not found.`);
  }

  const accepted = merchantAcceptedVersion ?? null;
  const required = accepted === null || accepted < active.policy_version;

  return {
    required,
    activeVersion: active.policy_version,
    acceptedVersion: accepted,
    activePolicy: active,
  };
}
