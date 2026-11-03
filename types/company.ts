// path: types/company.ts

import { z } from 'zod';
import { BaseEntity, CreateEntityInput, UpdateEntityInput } from './entity';

/**
 * Valid legal structure classifications for sub-merchant entities.
 */
export type BusinessType =
  | 'corporation'
  | 'llc'
  | 'sole_proprietorship'
  | 'partnership'
  | 'non_profit';

/**
 * Sub-merchant company lifecycle statuses.
 */
export type CompanyStatus =
  | 'draft'
  | 'under_review'
  | 'active'
  | 'suspended'
  | 'closed';

/**
 * Platform risk tier categorization governing rolling reserve and settlement hold durations.
 * - Tier 1: Low risk (fast settlement, low reserve)
 * - Tier 2: Standard risk (default baseline)
 * - Tier 3: High risk / elevated chargeback potential (mandatory rolling reserve, extended holds)
 */
export type RiskTier = 1 | 2 | 3;

/**
 * Physical operating address structure.
 */
export interface OperatingAddress {
  readonly street1: string;
  readonly street2?: string | undefined;
  readonly city: string;
  readonly state?: string | undefined;
  readonly postalCode: string;
  readonly country: string;
}

/**
 * Full Sub-Merchant Company entity extending standard KD Solution IT base table attributes.
 */
export interface CompanyEntity extends BaseEntity {
  readonly legal_name: string;
  readonly dba_name: string;
  readonly business_type: BusinessType;
  readonly registration_number: string;
  readonly country: string;
  readonly operating_address: OperatingAddress;
  readonly mcc: string;
  readonly risk_tier: RiskTier;
  readonly status: CompanyStatus;
  readonly custom_fee_percent: string;
  readonly custom_hold_days: number;
  readonly reserve_percent: string;
  readonly reserve_hold_days: number;
  readonly default_currency: 'USD';
}

/**
 * Input type for creating a new sub-merchant company.
 */
export type CreateCompanyInput = CreateEntityInput<CompanyEntity>;

/**
 * Input type for mutating an existing sub-merchant company.
 */
export type UpdateCompanyInput = UpdateEntityInput<CompanyEntity>;

/**
 * Zod validation schema for operating physical address.
 */
export const OperatingAddressSchema = z.object({
  street1: z.string().min(1, 'Street address is required').max(255),
  street2: z.string().max(255).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1, 'Postal code is required').max(30),
  country: z.string().length(2, 'Country must be a 2-letter ISO 3166-1 alpha-2 code').toUpperCase(),
});

/**
 * Zod validation schema for sub-merchant registration and onboarding.
 */
export const CompanyCreateSchema = z.object({
  legal_name: z.string().min(2, 'Legal business name must be at least 2 characters').max(255),
  dba_name: z.string().min(2, 'Trade name / DBA must be at least 2 characters').max(255),
  business_type: z.enum(['corporation', 'llc', 'sole_proprietorship', 'partnership', 'non_profit']),
  registration_number: z.string().min(2, 'Tax or company registration number is required').max(100),
  country: z.string().length(2, 'Country must be a 2-letter ISO alpha-2 code').toUpperCase(),
  operating_address: OperatingAddressSchema,
  mcc: z.string().regex(/^\d{4}$/, 'MCC must be a valid 4-digit Merchant Category Code'),
  risk_tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  status: z.enum(['draft', 'under_review', 'active', 'suspended', 'closed']).default('draft'),
  custom_fee_percent: z
    .string()
    .regex(/^\d{1,3}\.\d{4}$/, 'Custom fee must be numeric format like 0.0000')
    .default('0.0000'),
  custom_hold_days: z.number().int().min(0).max(180).default(7),
  reserve_percent: z
    .string()
    .regex(/^\d{1,3}\.\d{4}$/, 'Reserve percent must be numeric format like 10.0000')
    .default('10.0000'),
  reserve_hold_days: z.number().int().min(0).max(365).default(180),
  default_currency: z.literal('USD').default('USD'),
});

/**
 * Zod schema for updating company settings and compliance status.
 */
export const CompanyUpdateSchema = CompanyCreateSchema.partial();
