// path: lib/auth/rbac-types.ts
import type { MembershipRole } from '@/lib/database';

export type Permission =
  // Charges & Transactions
  | 'charges:read'
  | 'charges:create'
  | 'charges:capture'
  // Refunds
  | 'refunds:read'
  | 'refunds:create'
  | 'refunds:approve'
  // Disputes
  | 'disputes:read'
  | 'disputes:respond'
  | 'disputes:accept'
  // Payouts & Disbursements
  | 'payouts:read'
  | 'payouts:configure'
  | 'payouts:freeze'
  // Bank Accounts
  | 'bank_accounts:read'
  | 'bank_accounts:write'
  // API Keys & Webhooks
  | 'api_keys:read'
  | 'api_keys:write'
  | 'webhooks:read'
  | 'webhooks:write'
  // Compliance & KYC/KYB
  | 'kyc:read'
  | 'kyc:review'
  | 'kyc:approve'
  | 'risk:configure'
  // Tenant & Team Management
  | 'tenant:read'
  | 'tenant:write'
  | 'team:read'
  | 'team:invite'
  | 'team:manage'
  // Audit Logs
  | 'audit_logs:read'
  | 'audit_logs:export'
  // Invoices & Billing
  | 'invoices:read'
  | 'invoices:write'
  // Gateway Routing Rules
  | 'gateways:read'
  | 'gateways:configure';

/**
 * Standard Role-Permission Mapping Matrix for KD SOLUTION IT PayFac.
 */
export const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  // Owner: Complete platform and tenant administrative authority
  owner: [
    'charges:read',
    'charges:create',
    'charges:capture',
    'refunds:read',
    'refunds:create',
    'refunds:approve',
    'disputes:read',
    'disputes:respond',
    'disputes:accept',
    'payouts:read',
    'payouts:configure',
    'payouts:freeze',
    'bank_accounts:read',
    'bank_accounts:write',
    'api_keys:read',
    'api_keys:write',
    'webhooks:read',
    'webhooks:write',
    'kyc:read',
    'kyc:review',
    'kyc:approve',
    'risk:configure',
    'tenant:read',
    'tenant:write',
    'team:read',
    'team:invite',
    'team:manage',
    'audit_logs:read',
    'invoices:read',
    'invoices:write',
    'gateways:read',
    'gateways:configure',
  ],

  // Admin: Operations, transactions, API keys, reports, team invites
  admin: [
    'charges:read',
    'charges:create',
    'charges:capture',
    'refunds:read',
    'refunds:create',
    'refunds:approve',
    'disputes:read',
    'disputes:respond',
    'disputes:accept',
    'payouts:read',
    'payouts:configure',
    'bank_accounts:read',
    'api_keys:read',
    'api_keys:write',
    'webhooks:read',
    'webhooks:write',
    'kyc:read',
    'tenant:read',
    'team:read',
    'team:invite',
    'audit_logs:read',
    'invoices:read',
    'invoices:write',
    'gateways:read',
    'gateways:configure',
  ],

  // Compliance Officer: KYC/KYB reviews, SAR reports, sanction screening, risk tier updates, payout freezes
  compliance_officer: [
    'charges:read',
    'refunds:read',
    'disputes:read',
    'payouts:read',
    'payouts:freeze',
    'bank_accounts:read',
    'kyc:read',
    'kyc:review',
    'kyc:approve',
    'risk:configure',
    'tenant:read',
    'audit_logs:read',
    'audit_logs:export',
    'invoices:read',
  ],

  // Developer: API keys, webhooks, gateway testing, technical logs
  developer: [
    'charges:read',
    'charges:create',
    'refunds:read',
    'disputes:read',
    'api_keys:read',
    'api_keys:write',
    'webhooks:read',
    'webhooks:write',
    'tenant:read',
    'audit_logs:read',
    'gateways:read',
    'gateways:configure',
  ],

  // Merchant Viewer: Read-only access to transactions, settlements, and invoices
  merchant_viewer: [
    'charges:read',
    'refunds:read',
    'disputes:read',
    'payouts:read',
    'tenant:read',
    'invoices:read',
  ],
};
