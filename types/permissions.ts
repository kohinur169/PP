// path: types/permissions.ts

import { z } from 'zod';

/**
 * System Platform Roles for KD SOLUTION IT PayFac.
 * Exactly 8 distinct roles governing platform access and dashboard routing.
 */
export enum Role {
  SUPER_ADMIN = 'super_admin',
  CEO = 'ceo',
  COMPLIANCE_KYC = 'compliance_kyc',
  FINANCE_OPS = 'finance_ops',
  SUPPORT = 'support',
  BLOGGER = 'blogger',
  OWNER = 'owner',
  CLIENT = 'client',
}

/**
 * String union type matching the Role enum.
 */
export type PlatformRole =
  | 'super_admin'
  | 'ceo'
  | 'compliance_kyc'
  | 'finance_ops'
  | 'support'
  | 'blogger'
  | 'owner'
  | 'client';

/**
 * All platform roles as a constant array.
 */
export const PLATFORM_ROLES: readonly PlatformRole[] = [
  Role.SUPER_ADMIN,
  Role.CEO,
  Role.COMPLIANCE_KYC,
  Role.FINANCE_OPS,
  Role.SUPPORT,
  Role.BLOGGER,
  Role.OWNER,
  Role.CLIENT,
] as const;

/**
 * Granular system permissions catalog.
 */
export enum Permission {
  // Gateways & Processors (NMI, Payoneer, Rainforest, Stripe Connect, Airwallex)
  MANAGE_GATEWAYS = 'MANAGE_GATEWAYS',
  VIEW_GATEWAYS = 'VIEW_GATEWAYS',
  ROTATE_GATEWAY_KEYS = 'ROTATE_GATEWAY_KEYS',

  // KYC & Underwriting & Compliance
  VIEW_KYC = 'VIEW_KYC',
  REVIEW_KYC = 'REVIEW_KYC',
  APPROVE_KYC = 'APPROVE_KYC',
  PREPARE_SAR = 'PREPARE_SAR',
  VIEW_SAR = 'VIEW_SAR',
  SANCTIONS_PEP_SCREEN = 'SANCTIONS_PEP_SCREEN',
  UNDERWRITING_CONFIG = 'UNDERWRITING_CONFIG',

  // Pricing, Fees & Country Controls
  MANAGE_PRICING = 'MANAGE_PRICING',
  VIEW_PRICING = 'VIEW_PRICING',
  APPROVE_PRICING_CHANGE = 'APPROVE_PRICING_CHANGE',
  ENABLE_DISABLE_COUNTRY = 'ENABLE_DISABLE_COUNTRY',

  // Payouts & Disbursements & Reserves
  VIEW_PAYOUTS = 'VIEW_PAYOUTS',
  INITIATE_PAYOUT = 'INITIATE_PAYOUT',
  RELEASE_PAYOUT = 'RELEASE_PAYOUT',
  APPROVE_LARGE_PAYOUT = 'APPROVE_LARGE_PAYOUT',
  FREEZE_PAYOUT = 'FREEZE_PAYOUT',
  HANDLE_FAILED_PAYOUTS = 'HANDLE_FAILED_PAYOUTS',

  // Ledger, Accounting & Reconciliation
  VIEW_LEDGER = 'VIEW_LEDGER',
  MANAGE_RECONCILIATION = 'MANAGE_RECONCILIATION',
  RESOLVE_RECONCILIATION_MISMATCH = 'RESOLVE_RECONCILIATION_MISMATCH',
  MATCH_PROCESSOR_BILLS = 'MATCH_PROCESSOR_BILLS',

  // Transactions, Charges & Payments
  VIEW_CHARGES = 'VIEW_CHARGES',
  CREATE_CHARGES = 'CREATE_CHARGES',
  CAPTURE_CHARGES = 'CAPTURE_CHARGES',
  MANUAL_PAYMENT_REVIEW = 'MANUAL_PAYMENT_REVIEW',

  // Refunds
  VIEW_REFUNDS = 'VIEW_REFUNDS',
  CREATE_REFUNDS = 'CREATE_REFUNDS',
  APPROVE_REFUNDS = 'APPROVE_REFUNDS',

  // Disputes & Chargebacks
  VIEW_DISPUTES = 'VIEW_DISPUTES',
  RESPOND_DISPUTES = 'RESPOND_DISPUTES',
  ACCEPT_DISPUTES = 'ACCEPT_DISPUTES',
  REVIEW_DISPUTE_DOCS = 'REVIEW_DISPUTE_DOCS',

  // Support & Helpdesk
  VIEW_TICKETS = 'VIEW_TICKETS',
  CREATE_TICKETS = 'CREATE_TICKETS',
  ASSIGN_TICKETS = 'ASSIGN_TICKETS',
  RESOLVE_TICKETS = 'RESOLVE_TICKETS',
  HELP_MERCHANT = 'HELP_MERCHANT',

  // Blog & CMS
  VIEW_BLOG = 'VIEW_BLOG',
  CREATE_BLOG_POSTS = 'CREATE_BLOG_POSTS',
  EDIT_BLOG_POSTS = 'EDIT_BLOG_POSTS',
  PUBLISH_BLOG_POSTS = 'PUBLISH_BLOG_POSTS',
  MANAGE_CMS = 'MANAGE_CMS',

  // Sub-Merchant / Owner Operations
  VIEW_MERCHANT_DASHBOARD = 'VIEW_MERCHANT_DASHBOARD',
  MANAGE_MERCHANT_SETTINGS = 'MANAGE_MERCHANT_SETTINGS',
  INVITE_TEAM = 'INVITE_TEAM',
  MANAGE_TEAM = 'MANAGE_TEAM',
  MANAGE_API_KEYS = 'MANAGE_API_KEYS',
  MANAGE_WEBHOOKS = 'MANAGE_WEBHOOKS',
  VIEW_BANK_ACCOUNTS = 'VIEW_BANK_ACCOUNTS',
  MANAGE_BANK_ACCOUNTS = 'MANAGE_BANK_ACCOUNTS',
  VIEW_INVOICES = 'VIEW_INVOICES',
  MANAGE_INVOICES = 'MANAGE_INVOICES',

  // Platform Administration & Security
  MANAGE_PLATFORM_SETTINGS = 'MANAGE_PLATFORM_SETTINGS',
  DELEGATE_PERMISSIONS = 'DELEGATE_PERMISSIONS',
  UNLOCK_ACCOUNTS = 'UNLOCK_ACCOUNTS',
  RESET_OFFICE_2FA = 'RESET_OFFICE_2FA',
  VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',
  EXPORT_AUDIT_LOGS = 'EXPORT_AUDIT_LOGS',

  // Client (Token-only)
  TOKEN_CHECKOUT = 'TOKEN_CHECKOUT',
  VIEW_PAYMENT_SESSION = 'VIEW_PAYMENT_SESSION',
}

/**
 * String union type matching the Permission enum.
 */
export type SystemPermission = `${Permission}`;

/**
 * All system permissions as a constant array.
 */
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/**
 * Zod validation schema for Role.
 */
export const RoleSchema = z.nativeEnum(Role);

/**
 * Zod validation schema for Permission.
 */
export const PermissionSchema = z.nativeEnum(Permission);
