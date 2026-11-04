// path: types/audit.ts

import { z } from 'zod';
import { BaseEntity } from './entity';

/**
 * Enterprise Audit Event Categories grouping operational mutations.
 */
export type AuditEventCategory =
  | 'auth'
  | 'membership'
  | 'company'
  | 'kyc'
  | 'risk'
  | 'gateway'
  | 'payment'
  | 'ledger'
  | 'dispute'
  | 'settlement'
  | 'file'
  | 'tax'
  | 'email'
  | 'cms'
  | 'system';

/**
 * Standard enterprise audit action identifiers.
 */
export type StandardAuditAction =
  // Authentication & Sessions
  | 'USER_REGISTERED'
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_PASSWORD_CHANGED'
  | 'AUTH_PASSWORD_RESET_REQUESTED'
  | 'AUTH_PASSWORD_RESET_COMPLETED'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_ACCOUNT_UNLOCKED'
  | 'USER_UNLOCKED_BY_OFFICE'
  | 'AUTH_2FA_ENABLED'
  | 'AUTH_2FA_DISABLED'
  | 'AUTH_2FA_VERIFIED'
  | 'AUTH_2FA_RESET_REQUESTED'
  | '2FA_RESET_BY_OFFICE'
  | 'SESSION_CREATED'
  | 'SESSION_ROTATED'
  | 'SESSION_REVOKED'
  | 'SESSION_REPLAY_DETECTED'
  | 'GLOBAL_SESSION_REVOCATION'
  | 'NEW_DEVICE_LOGIN_DETECTED'
  | 'NEW_DEVICE_CONFIRMED'
  | 'STEP_UP_REAUTH_PASSED'
  // Membership & Organization
  | 'COMPANY_CREATED'
  | 'COMPANY_UPDATED'
  | 'COMPANY_STATUS_CHANGED'
  | 'MEMBER_INVITED'
  | 'MEMBER_ACCEPTED'
  | 'MEMBER_ROLE_UPDATED'
  | 'MEMBER_REVOKED'
  | 'OWNERSHIP_TRANSFERRED'
  | 'STAFF_ONBOARDED'
  | 'STAFF_OFFBOARDED_IMMEDIATELY'
  | 'COMPLIANCE_OFFICER_APPOINTED'
  // KYC / KYB & Compliance
  | 'KYC_DOCUMENT_SUBMITTED'
  | 'KYC_STATUS_UPDATED'
  | 'KYC_VERIFICATION_DECISION'
  | 'SANCTIONS_SCREENING_COMPLETED'
  | 'PEP_MATCH_RESOLVED'
  // Risk & Policy
  | 'RISK_TIER_CHANGED'
  | 'RISK_LIMIT_MODIFIED'
  | 'RESERVE_RATE_ADJUSTED'
  | 'FULFILMENT_GATE_VERIFIED'
  | 'PAYOUT_GATE_EVALUATED'
  | 'TRANSACTION_REVIEW_DECIDED'
  // Gateway & Key Management
  | 'GATEWAY_CREDENTIALS_CONFIGURED'
  | 'GATEWAY_KEY_ROTATED'
  | 'GATEWAY_CONNECTION_TESTED'
  | 'WEBHOOK_RECEIVED'
  | 'WEBHOOK_PROCESSED'
  // Payments & Disputes
  | 'PAYMENT_INTENT_CREATED'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_VOIDED'
  | 'CHARGEBACK_RECORDED'
  | 'CHARGEBACK_EVIDENCE_SUBMITTED'
  | 'DISPUTE_DECISION_RECORDED'
  // Double-Entry Ledger & Settlements
  | 'LEDGER_TRANSACTION_RECORDED'
  | 'SETTLEMENT_BATCH_GENERATED'
  | 'SETTLEMENT_RELEASED'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_DISPATCHED'
  // File & Document Storage
  | 'FILE_UPLOADED'
  | 'FILE_ACCESSED'
  | 'FILE_DECRYPTED'
  | 'FILE_DELETED'
  // Policy, Settings & CMS
  | 'POLICY_PROPOSED'
  | 'POLICY_APPROVED'
  | 'TAX_CONFIG_UPDATED'
  | 'EMAIL_CONFIG_UPDATED'
  | 'CMS_POST_CREATED'
  | 'CMS_POST_UPDATED'
  | 'MERKLE_ROOT_EXPORTED'
  | 'SYSTEM_SEED_PROVISIONED';

/**
 * Union allowing standard audit actions with fallback for extensible custom actions.
 */
export type AuditAction = StandardAuditAction | (string & {});

/**
 * Structured diff payload recording before/after mutation states.
 */
export interface AuditDiffPayload {
  readonly before?: Record<string, unknown> | null | undefined;
  readonly after?: Record<string, unknown> | null | undefined;
  readonly changed_fields?: readonly string[] | null | undefined;
}

/**
 * Full Immutable Hash-Chained Audit Log Entity.
 */
export interface AuditLogEntity extends BaseEntity {
  /**
   * Monotonically incrementing BIGSERIAL sequence index across the platform.
   */
  readonly sequence_id: number;

  /**
   * Cryptographic SHA-256 hash of the immediately preceding audit log entry.
   * Equal to 64 zeros for the platform genesis block.
   */
  readonly prev_hash: string;

  /**
   * Cryptographic SHA-256 hash chaining sequence_id, prev_hash, and payload.
   */
  readonly current_hash: string;

  /**
   * Stored alias matching current_hash for database query flexibility.
   */
  readonly entry_hash: string;

  /**
   * Optional Ed25519 asymmetric cryptographic signature of current_hash.
   */
  readonly signature: string | null;

  /**
   * Authenticated user or staff ID triggering the mutation, or null for system events.
   */
  readonly actor_id: string | null;

  /**
   * Machine-readable action name (e.g. AUTH_LOGIN_SUCCESS, KYC_VERIFICATION_DECISION).
   */
  readonly action: string;

  /**
   * Classification of the mutated target entity (e.g. company, user, payment, session).
   */
  readonly entity_type: string;

  /**
   * Unique identifier of the mutated entity (e.g. UUIDv7 id or business key).
   */
  readonly entity_id: string | null;

  /**
   * Structured before/after mutation differences.
   */
  readonly diff_payload: AuditDiffPayload | null;

  /**
   * Structured contextual payload and metadata for the event.
   */
  readonly payload: Record<string, unknown>;

  /**
   * Originating client IPv4 or IPv6 address.
   */
  readonly ip_address: string | null;

  /**
   * Originating client User-Agent header string.
   */
  readonly user_agent: string | null;
}

/**
 * Input fields required to create a new audit log record.
 */
export interface CreateAuditLogInput {
  readonly id?: string | undefined;
  readonly sequence_id?: number | undefined;
  readonly company_id?: string | null | undefined;
  readonly actor_id?: string | null | undefined;
  readonly action: AuditAction;
  readonly entity_type: string;
  readonly entity_id?: string | null | undefined;
  readonly diff_payload?: AuditDiffPayload | null | undefined;
  readonly payload?: Record<string, unknown> | undefined;
  readonly prev_hash?: string | undefined;
  readonly current_hash?: string | undefined;
  readonly signature?: string | null | undefined;
  readonly ip_address?: string | null | undefined;
  readonly user_agent?: string | null | undefined;
}

/**
 * Zod schema for structured diff payloads.
 */
export const AuditDiffPayloadSchema = z
  .object({
    before: z.record(z.string(), z.unknown()).nullish(),
    after: z.record(z.string(), z.unknown()).nullish(),
    changed_fields: z.array(z.string()).nullish(),
  })
  .strict();

/**
 * Zod schema for audit log creation input validation.
 */
export const AuditLogCreateSchema = z
  .object({
    id: z.string().uuid().optional(),
    sequence_id: z.number().int().positive().optional(),
    company_id: z.string().uuid().nullish(),
    actor_id: z.string().uuid().nullish(),
    action: z.string().min(1).max(100),
    entity_type: z.string().min(1).max(100),
    entity_id: z.string().max(255).nullish(),
    diff_payload: AuditDiffPayloadSchema.nullish(),
    payload: z.record(z.string(), z.unknown()).default({}),
    prev_hash: z.string().length(64).regex(/^[a-f0-9]{64}$/i).optional(),
    current_hash: z.string().length(64).regex(/^[a-f0-9]{64}$/i).optional(),
    signature: z.string().max(256).nullish(),
    ip_address: z.string().max(45).nullish(),
    user_agent: z.string().nullish(),
  })
  .strict();

/**
 * Zod schema for full audit log entity validation.
 */
export const AuditLogEntitySchema = z
  .object({
    id: z.string().uuid(),
    sequence_id: z.number().int().nonnegative(),
    company_id: z.string(),
    actor_id: z.string().uuid().nullable(),
    action: z.string().min(1).max(100),
    entity_type: z.string().min(1).max(100),
    entity_id: z.string().nullable(),
    diff_payload: AuditDiffPayloadSchema.nullable(),
    payload: z.record(z.string(), z.unknown()),
    prev_hash: z.string().length(64).regex(/^[a-f0-9]{64}$/i),
    current_hash: z.string().length(64).regex(/^[a-f0-9]{64}$/i),
    entry_hash: z.string().length(64).regex(/^[a-f0-9]{64}$/i),
    signature: z.string().nullable(),
    ip_address: z.string().nullable(),
    user_agent: z.string().nullable(),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    deleted_at: z.string().datetime({ offset: true }).nullable(),
    version: z.number().int().positive(),
  })
  .strict();

/**
 * Genesis hash string consisting of 64 hex zeros.
 */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Daily Merkle Root aggregation entity for anchoring audit chains.
 */
export interface AuditMerkleRootEntity extends BaseEntity {
  readonly batch_date: string;
  readonly merkle_root: string;
  readonly entry_count: number;
  readonly first_sequence_id: number;
  readonly last_sequence_id: number;
}

/**
 * Input type for inserting or anchoring a daily audit Merkle root.
 */
export interface CreateAuditMerkleRootInput {
  readonly id?: string | undefined;
  readonly company_id?: string | null | undefined;
  readonly batch_date: string;
  readonly merkle_root: string;
  readonly entry_count: number;
  readonly first_sequence_id: number;
  readonly last_sequence_id: number;
}

/**
 * Zod schema for full audit Merkle root entity validation.
 */
export const AuditMerkleRootEntitySchema = z
  .object({
    id: z.string().uuid(),
    company_id: z.string(),
    batch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    merkle_root: z.string().length(64).regex(/^[a-f0-9]{64}$/i),
    entry_count: z.number().int().nonnegative(),
    first_sequence_id: z.number().int().nonnegative(),
    last_sequence_id: z.number().int().nonnegative(),
    created_at: z.string(),
    updated_at: z.string(),
    deleted_at: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
