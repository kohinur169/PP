// path: lib/db/companies.ts

import { AbstractRepository, EntityStorageDriver } from './repository';
import {
  CompanyEntity,
  CreateCompanyInput,
  UpdateCompanyInput,
  RiskTier,
  CompanyStatus,
  CompanyCreateSchema,
} from '../../types/company';

/**
 * Enterprise Sub-Merchant Company Repository.
 * Enforces KD Solution IT business rules:
 * - Time-ordered RFC 9562 UUIDv7 Primary Keys
 * - Unique (country, registration_number) enforcement
 * - Mandatory USD baseline currency
 * - Explicit risk tiers (1, 2, or 3)
 * - Safe soft-deletion and optimistic concurrency control
 */
export class CompanyRepository extends AbstractRepository<CompanyEntity> {
  constructor(options?: {
    readonly defaultCompanyId?: string | undefined;
    readonly driver?: EntityStorageDriver<CompanyEntity> | undefined;
  }) {
    super('Company', options);
  }

  /**
   * Registers a new sub-merchant company with validated schema attributes.
   */
  public async createCompany(input: CreateCompanyInput): Promise<CompanyEntity> {
    // Validate domain input using Zod schema
    const validated = CompanyCreateSchema.parse({
      legal_name: input.legal_name,
      dba_name: input.dba_name,
      business_type: input.business_type,
      registration_number: input.registration_number,
      country: input.country,
      operating_address: input.operating_address,
      mcc: input.mcc,
      risk_tier: input.risk_tier ?? 2,
      status: input.status ?? 'draft',
      custom_fee_percent: input.custom_fee_percent ?? '0.0000',
      custom_hold_days: input.custom_hold_days ?? 7,
      reserve_percent: input.reserve_percent ?? '10.0000',
      reserve_hold_days: input.reserve_hold_days ?? 180,
      default_currency: 'USD',
    });

    // Check unique (country, registration_number)
    const existing = await this.findByCountryAndRegistration(
      validated.country,
      validated.registration_number
    );

    if (existing) {
      throw new Error(
        `Company registration conflict: A business with registration number "${validated.registration_number}" already exists in country "${validated.country}".`
      );
    }

    const companyId = input.company_id ?? input.id ?? undefined;

    return await this.create({
      ...input,
      ...validated,
      ...(companyId ? { company_id: companyId, id: companyId } : {}),
      default_currency: 'USD',
    });
  }

  /**
   * Looks up a company by its country code and registration number.
   */
  public async findByCountryAndRegistration(
    country: string,
    registrationNumber: string
  ): Promise<CompanyEntity | null> {
    const normalizedCountry = country.toUpperCase();
    const normalizedReg = registrationNumber.trim();

    const matches = await this.findMany({
      includeDeleted: true,
    });

    const found = matches.find(
      (c) =>
        c.country.toUpperCase() === normalizedCountry &&
        c.registration_number.trim() === normalizedReg
    );

    return found ?? null;
  }

  /**
   * Updates risk tier with optimistic locking.
   */
  public async updateRiskTier(
    id: string,
    expectedVersion: number,
    riskTier: RiskTier
  ): Promise<CompanyEntity> {
    if (![1, 2, 3].includes(riskTier)) {
      throw new RangeError(`Invalid risk tier: ${riskTier}. Must be 1, 2, or 3.`);
    }

    return await this.update(id, expectedVersion, { risk_tier: riskTier });
  }

  /**
   * Updates company operational status with optimistic locking.
   */
  public async updateStatus(
    id: string,
    expectedVersion: number,
    status: CompanyStatus
  ): Promise<CompanyEntity> {
    const validStatuses: CompanyStatus[] = [
      'draft',
      'under_review',
      'active',
      'suspended',
      'closed',
    ];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid company status: "${String(status)}"`);
    }

    return await this.update(id, expectedVersion, { status });
  }

  /**
   * Mutates fee and rolling reserve override parameters.
   */
  public async updateFeeSettings(
    id: string,
    expectedVersion: number,
    fees: {
      readonly custom_fee_percent?: string | undefined;
      readonly custom_hold_days?: number | undefined;
      readonly reserve_percent?: string | undefined;
      readonly reserve_hold_days?: number | undefined;
    }
  ): Promise<CompanyEntity> {
    return await this.update(id, expectedVersion, fees);
  }
}
