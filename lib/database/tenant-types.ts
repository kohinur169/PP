// path: lib/database/tenant-types.ts

export type TenantStatus = 'active' | 'suspended' | 'pending_kyc' | 'terminated';

export type UserStatus = 'active' | 'suspended' | 'pending_verification' | 'deactivated';

export type MembershipRole =
  | 'owner'
  | 'admin'
  | 'compliance_officer'
  | 'developer'
  | 'merchant_viewer';

export type MembershipStatus = 'active' | 'invited' | 'suspended' | 'revoked';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface TenantSettings {
  id: string;
  tenant_id: string;
  default_currency: 'USD';
  allowed_countries: string[];
  risk_tier: 1 | 2 | 3;
  settlement_delay_days: number;
  rolling_reserve_pct: number;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  status: UserStatus;
  is_superadmin: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
}

export interface TenantContext {
  tenantId?: string | undefined;
  userId?: string | undefined;
  isSuperadmin?: boolean | undefined;
}
