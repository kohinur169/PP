// path: types/membership.ts

import { z } from 'zod';
import { BaseEntity, CreateEntityInput, UpdateEntityInput } from './entity';

/**
 * Enterprise company membership roles.
 */
export type CompanyMemberRole =
  | 'owner'
  | 'super_admin'
  | 'ceo'
  | 'compliance_kyc'
  | 'finance_ops'
  | 'support'
  | 'blogger'
  | 'admin'
  | 'developer'
  | 'merchant_viewer';

/**
 * Membership invitation and lifecycle statuses.
 */
export type CompanyMemberStatus = 'active' | 'invited' | 'revoked';

/**
 * Full Company Member Entity modeling the junction between users and merchant companies.
 */
export interface CompanyMemberEntity extends BaseEntity {
  readonly company_id: string;
  readonly user_id: string;
  readonly role: CompanyMemberRole;
  readonly status: CompanyMemberStatus;
  readonly permissions: string[];
  readonly invited_at?: string | null | undefined;
  readonly accepted_at?: string | null | undefined;
}

/**
 * Input type for creating a new company member record.
 */
export type CreateCompanyMemberInput = CreateEntityInput<CompanyMemberEntity>;

/**
 * Input type for mutating an existing company member record.
 */
export type UpdateCompanyMemberInput = UpdateEntityInput<CompanyMemberEntity>;

/**
 * Zod validation schema for company member role.
 */
export const CompanyMemberRoleSchema = z.enum([
  'owner',
  'super_admin',
  'ceo',
  'compliance_kyc',
  'finance_ops',
  'support',
  'blogger',
  'admin',
  'developer',
  'merchant_viewer',
]);

/**
 * Zod validation schema for membership status.
 */
export const CompanyMemberStatusSchema = z.enum(['active', 'invited', 'revoked']);

/**
 * Zod validation schema for inviting or adding a company member.
 */
export const CompanyMemberCreateSchema = z.object({
  company_id: z.string().uuid('Valid company UUID is required'),
  user_id: z.string().uuid('Valid user UUID is required'),
  role: CompanyMemberRoleSchema,
  status: CompanyMemberStatusSchema.default('active'),
  permissions: z.array(z.string()).default([]),
  invited_at: z.string().datetime().optional().nullable(),
  accepted_at: z.string().datetime().optional().nullable(),
});

/**
 * Zod schema for updating role or status of an existing member.
 */
export const CompanyMemberUpdateSchema = CompanyMemberCreateSchema.partial();
