// path: lib/compliance/country-control.ts

import { z } from 'zod';
import { AbstractRepository, EntityStorageDriver, InMemoryStorageDriver } from '@/lib/db/repository';
import { AuditLogRepository } from '@/lib/db/audit';
import { Role } from '@/lib/auth/roles';
import { logger } from '@/lib/logger';
import { BaseEntity, EntityNotFoundError, OptimisticLockError, UpdateEntityInput } from '@/types/entity';

/**
 * Permanently and comprehensively sanctioned nations under OFAC, UN, and EU regulatory frameworks.
 * It is a hard illegal violation to enable or process transactions for these nations.
 */
export const COMPREHENSIVELY_SANCTIONED_COUNTRIES: Readonly<
  Record<string, { readonly name: string; readonly sanctionsProgram: string }>
> = {
  KP: {
    name: "Democratic People's Republic of Korea (North Korea)",
    sanctionsProgram: 'UN Security Council Res / OFAC 31 CFR Part 510',
  },
  IR: {
    name: 'Islamic Republic of Iran',
    sanctionsProgram: 'OFAC Comprehensive Sanctions / 31 CFR Part 560',
  },
  CU: {
    name: 'Republic of Cuba',
    sanctionsProgram: 'OFAC Cuban Assets Control Regulations / 31 CFR Part 515',
  },
  SY: {
    name: 'Syrian Arab Republic',
    sanctionsProgram: 'OFAC Syrian Sanctions Regulations / 31 CFR Part 542',
  },
};

export interface CountryControlEntity extends BaseEntity {
  readonly country_code: string; // ISO 3166-1 alpha-2 uppercase
  readonly country_name: string;
  readonly is_enabled: boolean;
  readonly is_sanctioned_frozen: boolean;
  readonly sanctions_program: string | null;
  readonly pending_change_status: 'pending_approval' | null;
  readonly proposed_enabled: boolean | null;
  readonly proposed_by: string | null;
  readonly approved_by: string | null;
  readonly change_justification: string | null;
}

export class SanctionedCountryFreezeViolationError extends Error {
  constructor(public readonly countryCode: string) {
    super(
      `FATAL SANCTIONS VIOLATION: Country "${countryCode}" is permanently frozen under OFAC/UN comprehensive sanctions regulations and cannot be enabled under any circumstances.`
    );
    this.name = 'SanctionedCountryFreezeViolationError';
  }
}

export class DualControlSelfApprovalError extends Error {
  constructor() {
    super('Dual-control violation: The approving officer cannot be the same user who proposed the country control change.');
    this.name = 'DualControlSelfApprovalError';
  }
}

export class UnauthorizedCountryControlError extends Error {
  constructor(role: string) {
    super(`Unauthorized country control operation: Role "${role}" is not authorized for country availability governance.`);
    this.name = 'UnauthorizedCountryControlError';
  }
}

const sharedCountryDriver = new InMemoryStorageDriver<CountryControlEntity>();

/**
 * Resets the in-memory store for isolated unit tests.
 */
export function clearCountryControlStore(): void {
  sharedCountryDriver.clear();
}

export const DEFAULT_PLATFORM_COMPANY_ID = '00000000-0000-7000-8000-000000000000';

/**
 * Repository for Country Controls & Global Availability.
 */
export class CountryControlRepository extends AbstractRepository<CountryControlEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<CountryControlEntity> | undefined;
  }) {
    super('CountryControl', {
      defaultCompanyId: options?.defaultCompanyId ?? DEFAULT_PLATFORM_COMPANY_ID,
      driver: options?.driver ?? sharedCountryDriver,
    });
  }

  public override async update(
    id: string,
    expectedVersion: number,
    input: UpdateEntityInput<CountryControlEntity>
  ): Promise<CountryControlEntity> {
    const current = await this.driver.findById(id);
    if (!current) {
      throw new EntityNotFoundError(this.entityName, id);
    }
    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(id, expectedVersion, current.version);
    }

    // Hardcode permanent sanctions check constraint in application layer
    const nextSanctioned = input.is_sanctioned_frozen ?? current.is_sanctioned_frozen;
    const nextEnabled = input.is_enabled ?? current.is_enabled;
    const nextProposedEnabled = input.proposed_enabled ?? current.proposed_enabled;

    if (nextSanctioned && (nextEnabled || nextProposedEnabled)) {
      throw new SanctionedCountryFreezeViolationError(current.country_code);
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
    } as CountryControlEntity;

    return await this.driver.update(updatedRecord);
  }

  public async findByCode(countryCode: string): Promise<CountryControlEntity | null> {
    const codeUpper = countryCode.trim().toUpperCase();
    const all = await this.findMany({ includeDeleted: false });
    return all.find((c) => c.country_code === codeUpper) ?? null;
  }
}

const defaultCountryRepo = new CountryControlRepository();
const defaultAuditRepo = new AuditLogRepository();

/**
 * Standard seed catalog of primary global merchant countries + sanctioned nations.
 */
export const INITIAL_COUNTRY_CATALOG: readonly Omit<
  CountryControlEntity,
  'id' | 'company_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'version'
>[] = [
  // Permitted merchant jurisdictions
  {
    country_code: 'US',
    country_name: 'United States',
    is_enabled: true,
    is_sanctioned_frozen: false,
    sanctions_program: null,
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: null,
  },
  {
    country_code: 'GB',
    country_name: 'United Kingdom',
    is_enabled: true,
    is_sanctioned_frozen: false,
    sanctions_program: null,
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: null,
  },
  {
    country_code: 'CA',
    country_name: 'Canada',
    is_enabled: true,
    is_sanctioned_frozen: false,
    sanctions_program: null,
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: null,
  },
  {
    country_code: 'DE',
    country_name: 'Germany',
    is_enabled: true,
    is_sanctioned_frozen: false,
    sanctions_program: null,
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: null,
  },
  {
    country_code: 'FR',
    country_name: 'France',
    is_enabled: true,
    is_sanctioned_frozen: false,
    sanctions_program: null,
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: null,
  },
  {
    country_code: 'AU',
    country_name: 'Australia',
    is_enabled: true,
    is_sanctioned_frozen: false,
    sanctions_program: null,
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: null,
  },
  {
    country_code: 'SG',
    country_name: 'Singapore',
    is_enabled: true,
    is_sanctioned_frozen: false,
    sanctions_program: null,
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: null,
  },

  // Comprehensively Sanctioned Nations - Permanently Frozen
  {
    country_code: 'KP',
    country_name: "Democratic People's Republic of Korea (North Korea)",
    is_enabled: false,
    is_sanctioned_frozen: true,
    sanctions_program: 'UN Security Council Res / OFAC 31 CFR Part 510',
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: 'Permanently frozen under international comprehensive sanctions.',
  },
  {
    country_code: 'IR',
    country_name: 'Islamic Republic of Iran',
    is_enabled: false,
    is_sanctioned_frozen: true,
    sanctions_program: 'OFAC Comprehensive Sanctions / 31 CFR Part 560',
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: 'Permanently frozen under international comprehensive sanctions.',
  },
  {
    country_code: 'CU',
    country_name: 'Republic of Cuba',
    is_enabled: false,
    is_sanctioned_frozen: true,
    sanctions_program: 'OFAC Cuban Assets Control Regulations / 31 CFR Part 515',
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: 'Permanently frozen under international comprehensive sanctions.',
  },
  {
    country_code: 'SY',
    country_name: 'Syrian Arab Republic',
    is_enabled: false,
    is_sanctioned_frozen: true,
    sanctions_program: 'OFAC Syrian Sanctions Regulations / 31 CFR Part 542',
    pending_change_status: null,
    proposed_enabled: null,
    proposed_by: null,
    approved_by: null,
    change_justification: 'Permanently frozen under international comprehensive sanctions.',
  },
];

/**
 * Ensures country catalog is seeded.
 */
export async function seedCountryCatalog(
  repo: CountryControlRepository = defaultCountryRepo
): Promise<void> {
  const existing = await repo.findMany({ includeDeleted: false });
  if (existing.length > 0) {
    return;
  }

  for (const country of INITIAL_COUNTRY_CATALOG) {
    await repo.create({
      company_id: DEFAULT_PLATFORM_COMPANY_ID,
      ...country,
    });
  }
}

/**
 * Step 081.2 & Step 081.3: Super Admin or CEO proposes country state change.
 */
export async function proposeCountryStateChange(
  params: {
    readonly countryCode: string;
    readonly enabled: boolean;
    readonly justification: string;
    readonly actorId: string;
    readonly actorRole: Role;
  },
  options?: {
    readonly repo?: CountryControlRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<CountryControlEntity> {
  const repo = options?.repo ?? defaultCountryRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const code = params.countryCode.trim().toUpperCase();

  const authorizedRoles = [Role.SUPER_ADMIN, Role.CEO];
  if (!authorizedRoles.includes(params.actorRole)) {
    throw new UnauthorizedCountryControlError(params.actorRole);
  }

  await seedCountryCatalog(repo);
  const country = await repo.findByCode(code);
  if (!country) {
    throw new Error(`Country with code "${code}" was not found in global registry.`);
  }

  // Hardcode check constraint: Attempting to enable a sanctioned country raises fatal error
  if (country.is_sanctioned_frozen && params.enabled) {
    throw new SanctionedCountryFreezeViolationError(code);
  }

  const updated = await repo.update(country.id, country.version, {
    pending_change_status: 'pending_approval',
    proposed_enabled: params.enabled,
    proposed_by: params.actorId,
    change_justification: params.justification,
  });

  try {
    await auditRepo.createLog({
      company_id: country.company_id,
      actor_id: params.actorId,
      action: 'COUNTRY_CONTROL_CHANGE_PROPOSED',
      entity_type: 'country_controls',
      entity_id: country.id,
      payload: {
        countryCode: code,
        countryName: country.country_name,
        currentEnabled: country.is_enabled,
        proposedEnabled: params.enabled,
        justification: params.justification,
        proposedBy: params.actorId,
        actorRole: params.actorRole,
      },
    });
  } catch (err) {
    logger.error('Failed to audit log country control change proposal', { error: err });
  }

  logger.info('Country control change proposed, awaiting dual-control approval', {
    countryCode: code,
    proposedEnabled: params.enabled,
    proposedBy: params.actorId,
  });

  return updated;
}

/**
 * Step 081.3: Counterpart executive ratifies and executes proposed country state change.
 */
export async function approveCountryStateChange(
  params: {
    readonly countryCode: string;
    readonly actorId: string;
    readonly actorRole: Role;
    readonly notes?: string | undefined;
  },
  options?: {
    readonly repo?: CountryControlRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<CountryControlEntity> {
  const repo = options?.repo ?? defaultCountryRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const code = params.countryCode.trim().toUpperCase();

  const authorizedRoles = [Role.SUPER_ADMIN, Role.CEO];
  if (!authorizedRoles.includes(params.actorRole)) {
    throw new UnauthorizedCountryControlError(params.actorRole);
  }

  await seedCountryCatalog(repo);
  const country = await repo.findByCode(code);
  if (!country) {
    throw new Error(`Country with code "${code}" was not found in global registry.`);
  }

  if (country.pending_change_status !== 'pending_approval' || country.proposed_enabled === null) {
    throw new Error(`Country "${code}" has no active pending state change awaiting approval.`);
  }

  // Dual-control enforcement: Approver cannot be the same user as proposer
  if (country.proposed_by === params.actorId) {
    throw new DualControlSelfApprovalError();
  }

  // Sanctions check constraint
  if (country.is_sanctioned_frozen && country.proposed_enabled) {
    throw new SanctionedCountryFreezeViolationError(code);
  }

  const nextEnabled = country.proposed_enabled;
  const updated = await repo.update(country.id, country.version, {
    is_enabled: nextEnabled,
    pending_change_status: null,
    proposed_enabled: null,
    approved_by: params.actorId,
  });

  try {
    await auditRepo.createLog({
      company_id: country.company_id,
      actor_id: params.actorId,
      action: 'COUNTRY_CONTROL_CHANGE_APPROVED',
      entity_type: 'country_controls',
      entity_id: country.id,
      payload: {
        countryCode: code,
        countryName: country.country_name,
        newEnabled: nextEnabled,
        proposedBy: country.proposed_by,
        approvedBy: params.actorId,
        actorRole: params.actorRole,
        notes: params.notes ?? 'Dual approval confirmed.',
      },
    });
  } catch (err) {
    logger.error('Failed to audit log country control change approval', { error: err });
  }

  logger.info('Country control change approved and executed', {
    countryCode: code,
    newEnabled: nextEnabled,
    approvedBy: params.actorId,
  });

  return updated;
}

/**
 * Emergency Circuit Breaker: Instantly freezes a country for regulatory / sanctions containment
 * without waiting for dual control.
 */
export async function emergencyDisableCountry(
  params: {
    readonly countryCode: string;
    readonly reason: string;
    readonly actorId: string;
    readonly actorRole: Role;
  },
  options?: {
    readonly repo?: CountryControlRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<CountryControlEntity> {
  const repo = options?.repo ?? defaultCountryRepo;
  const auditRepo = options?.auditRepo ?? defaultAuditRepo;
  const code = params.countryCode.trim().toUpperCase();

  const authorizedRoles = [Role.SUPER_ADMIN, Role.CEO];
  if (!authorizedRoles.includes(params.actorRole)) {
    throw new UnauthorizedCountryControlError(params.actorRole);
  }

  await seedCountryCatalog(repo);
  const country = await repo.findByCode(code);
  if (!country) {
    throw new Error(`Country with code "${code}" was not found.`);
  }

  const updated = await repo.update(country.id, country.version, {
    is_enabled: false,
    pending_change_status: null,
    proposed_enabled: null,
    change_justification: `EMERGENCY DISABLE: ${params.reason}`,
  });

  try {
    await auditRepo.createLog({
      company_id: country.company_id,
      actor_id: params.actorId,
      action: 'COUNTRY_CONTROL_EMERGENCY_DISABLED',
      entity_type: 'country_controls',
      entity_id: country.id,
      payload: {
        countryCode: code,
        countryName: country.country_name,
        reason: params.reason,
        disabledBy: params.actorId,
        actorRole: params.actorRole,
      },
    });
  } catch (err) {
    logger.error('Failed to audit log emergency country disable', { error: err });
  }

  logger.warn('Emergency country freeze executed', {
    countryCode: code,
    actorId: params.actorId,
    reason: params.reason,
  });

  return updated;
}

/**
 * Queries whether a given ISO 3166-1 alpha-2 country is permitted for merchant onboarding and payments.
 */
export async function isCountryEnabled(
  countryCode: string,
  repo: CountryControlRepository = defaultCountryRepo
): Promise<boolean> {
  const code = countryCode.trim().toUpperCase();

  // Comprehensively sanctioned nations are always disabled
  if (code in COMPREHENSIVELY_SANCTIONED_COUNTRIES) {
    return false;
  }

  await seedCountryCatalog(repo);
  const country = await repo.findByCode(code);
  if (!country) {
    return false;
  }

  return country.is_enabled && !country.is_sanctioned_frozen;
}
