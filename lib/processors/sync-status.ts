// path: lib/processors/sync-status.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger/logger';
import type { PaymentProcessorSlug } from '@/types/processors';

export type ProviderVerificationStatus =
  | 'pending'
  | 'action_required'
  | 'verified'
  | 'restricted'
  | 'rejected';

export interface AccountCapabilities {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  card_payments?: boolean;
  transfers?: boolean;
}

export interface SubmerchantVerificationRecord {
  id: string;
  tenantId: string;
  companyId: string;
  provider: PaymentProcessorSlug;
  providerSubmerchantId?: string | undefined;
  verificationStatus: ProviderVerificationStatus;
  capabilities: AccountCapabilities;
  lastSyncedAt: string;
  rawPayloadHash: string;
  metadata: Record<string, unknown>;
}

export interface ProviderCapabilitySyncInput {
  tenantId: string;
  companyId: string;
  provider: PaymentProcessorSlug;
  providerSubmerchantId: string;
  verificationStatus: ProviderVerificationStatus;
  capabilities: {
    charges_enabled: boolean;
    payouts_enabled: boolean;
    card_payments?: boolean;
    transfers?: boolean;
  };
  providerTimestamp: string;
  rawPayload: string | Record<string, unknown>;
  signatureVerified: boolean;
  idempotencyKey?: string | undefined;
}

export interface SyncCapabilitiesResult {
  record: SubmerchantVerificationRecord;
  statusChanged: boolean;
  capabilitiesChanged: boolean;
  idempotentReplay: boolean;
}

export class ProviderWebhookSecurityError extends Error {
  readonly code = 'WEBHOOK_SIGNATURE_INVALID';
  readonly httpStatus = 401;

  constructor(message = 'Invalid or unverified cryptographic webhook signature from payment provider.') {
    super(`[Security Guard: Webhook Signature] ${message}`);
    this.name = 'ProviderWebhookSecurityError';
  }
}

export class ProviderCapabilityRestrictionError extends Error {
  readonly code = 'PROVIDER_CAPABILITY_RESTRICTED';
  readonly httpStatus = 403;

  constructor(message: string, readonly context: Record<string, unknown> = {}) {
    super(`[Provider Capability Restriction] ${message}`);
    this.name = 'ProviderCapabilityRestrictionError';
  }
}

// In-memory store for isolated tenant & unit test runs
const inMemoryStore = new Map<string, SubmerchantVerificationRecord>();
const processedPayloadHashes = new Set<string>();

const auditRepo = new AuditLogRepository();

/**
 * Computes canonical SHA-256 hash of raw webhook payload.
 */
export function computeRawPayloadHash(payload: string | Record<string, unknown>): string {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Generates composite lookup key enforcing strict isolation between providers.
 */
function makeCompositeKey(companyId: string, provider: PaymentProcessorSlug): string {
  return `${companyId}:${provider}`;
}

/**
 * Synchronizes provider verification status and account capabilities from an idempotent,
 * signature-verified webhook.
 *
 * Core Invariant:
 * Seller charges stay strictly disabled (`charges_enabled: false`) for a provider
 * until that specific provider authoritative report confirms `verified` status.
 */
export async function syncProviderAccountCapabilities(
  input: ProviderCapabilitySyncInput
): Promise<SyncCapabilitiesResult> {
  // 1. Webhook Cryptographic Signature Verification Guard
  if (!input.signatureVerified) {
    logger.warn('Rejected provider capability webhook: signature verification failed', {
      provider: input.provider,
      companyId: input.companyId,
    });
    throw new ProviderWebhookSecurityError(
      `Webhook from provider '${input.provider}' rejected because signature verification failed.`
    );
  }

  // 2. Compute payload hash and check idempotency
  const rawPayloadHash = computeRawPayloadHash(input.rawPayload);
  const compositeKey = makeCompositeKey(input.companyId, input.provider);
  const existingRecord = inMemoryStore.get(compositeKey);

  if (processedPayloadHashes.has(rawPayloadHash) && existingRecord) {
    logger.info('Idempotent replay detected for provider capability webhook', {
      provider: input.provider,
      companyId: input.companyId,
      rawPayloadHash,
    });
    return {
      record: existingRecord,
      statusChanged: false,
      capabilitiesChanged: false,
      idempotentReplay: true,
    };
  }

  // 3. Enforce Invariant: Charges allowed ONLY when verification_status is 'verified'
  const isVerified = input.verificationStatus === 'verified';
  const effectiveChargesEnabled = isVerified ? Boolean(input.capabilities.charges_enabled) : false;

  // Payouts enabled if provider allows AND account is not restricted/rejected
  const isOperationalForPayouts = input.verificationStatus === 'verified' || input.verificationStatus === 'action_required';
  const effectivePayoutsEnabled = isOperationalForPayouts ? Boolean(input.capabilities.payouts_enabled) : false;

  const resolvedCapabilities: AccountCapabilities = {
    charges_enabled: effectiveChargesEnabled,
    payouts_enabled: effectivePayoutsEnabled,
    card_payments: effectiveChargesEnabled,
    transfers: effectivePayoutsEnabled,
  };

  const statusChanged = !existingRecord || existingRecord.verificationStatus !== input.verificationStatus;
  const capabilitiesChanged =
    !existingRecord ||
    existingRecord.capabilities.charges_enabled !== resolvedCapabilities.charges_enabled ||
    existingRecord.capabilities.payouts_enabled !== resolvedCapabilities.payouts_enabled;

  const record: SubmerchantVerificationRecord = {
    id: existingRecord?.id ?? generateUuidV7(),
    tenantId: input.tenantId,
    companyId: input.companyId,
    provider: input.provider,
    providerSubmerchantId: input.providerSubmerchantId,
    verificationStatus: input.verificationStatus,
    capabilities: resolvedCapabilities,
    lastSyncedAt: input.providerTimestamp,
    rawPayloadHash,
    metadata: {
      providerTimestamp: input.providerTimestamp,
      idempotencyKey: input.idempotencyKey,
    },
  };

  inMemoryStore.set(compositeKey, record);
  processedPayloadHashes.add(rawPayloadHash);

  // 4. Audit Log all capability transitions
  if (statusChanged || capabilitiesChanged) {
    try {
      await auditRepo.append({
        actor_id: '00000000-0000-0000-0000-000000000000', // Automated external provider webhook actor
        action: 'PROVIDER_CAPABILITY_SYNCHRONIZED',
        entity_type: 'submerchant_account',
        entity_id: compositeKey,
        diff_payload: {
          before: existingRecord
            ? {
                verificationStatus: existingRecord.verificationStatus,
                capabilities: existingRecord.capabilities,
              }
            : null,
          after: {
            verificationStatus: record.verificationStatus,
            capabilities: record.capabilities,
          },
        },
        payload: {
          provider: input.provider,
          companyId: input.companyId,
          previousStatus: existingRecord?.verificationStatus ?? 'none',
          newStatus: record.verificationStatus,
          providerTimestamp: input.providerTimestamp,
          rawPayloadHash,
        },
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to append audit log for provider capability synchronization', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        compositeKey,
      });
    }
  }

  logger.info('Provider capabilities successfully synchronized', {
    companyId: input.companyId,
    provider: input.provider,
    verificationStatus: record.verificationStatus,
    chargesEnabled: record.capabilities.charges_enabled,
    payoutsEnabled: record.capabilities.payouts_enabled,
  });

  return {
    record,
    statusChanged,
    capabilitiesChanged,
    idempotentReplay: false,
  };
}

/**
 * Retrieves the specific provider's verification status record for a merchant.
 * Ensures isolation: Never checks other providers.
 */
export async function getProviderVerificationRecord(
  companyId: string,
  provider: PaymentProcessorSlug
): Promise<SubmerchantVerificationRecord | null> {
  const key = makeCompositeKey(companyId, provider);
  return inMemoryStore.get(key) ?? null;
}

/**
 * Asserts that charges are enabled on the specific provider.
 * Throws ProviderCapabilityRestrictionError if unverified or disabled.
 */
export async function assertChargesEnabled(
  companyId: string,
  provider: PaymentProcessorSlug
): Promise<boolean> {
  const record = await getProviderVerificationRecord(companyId, provider);

  if (!record) {
    throw new ProviderCapabilityRestrictionError(
      `Merchant has no provisioned account with provider '${provider}'. Charges are disabled.`,
      { companyId, provider, reason: 'ACCOUNT_NOT_PROVISIONED' }
    );
  }

  if (record.verificationStatus !== 'verified') {
    throw new ProviderCapabilityRestrictionError(
      `Charges disabled for provider '${provider}': Verification status is '${record.verificationStatus}'. Must be 'verified'.`,
      { companyId, provider, verificationStatus: record.verificationStatus }
    );
  }

  if (!record.capabilities.charges_enabled) {
    throw new ProviderCapabilityRestrictionError(
      `Charges disabled for provider '${provider}': Processor reported charges_enabled = false.`,
      { companyId, provider }
    );
  }

  return true;
}

/**
 * Asserts that payouts are enabled on the specific provider.
 * Throws ProviderCapabilityRestrictionError if restricted or disabled.
 */
export async function assertPayoutsEnabled(
  companyId: string,
  provider: PaymentProcessorSlug
): Promise<boolean> {
  const record = await getProviderVerificationRecord(companyId, provider);

  if (!record) {
    throw new ProviderCapabilityRestrictionError(
      `Merchant has no account with provider '${provider}'. Payouts are disabled.`,
      { companyId, provider, reason: 'ACCOUNT_NOT_PROVISIONED' }
    );
  }

  if (record.verificationStatus === 'restricted' || record.verificationStatus === 'rejected') {
    throw new ProviderCapabilityRestrictionError(
      `Payouts blocked for provider '${provider}': Account is in status '${record.verificationStatus}'.`,
      { companyId, provider, verificationStatus: record.verificationStatus }
    );
  }

  if (!record.capabilities.payouts_enabled) {
    throw new ProviderCapabilityRestrictionError(
      `Payouts disabled for provider '${provider}': Processor reported payouts_enabled = false.`,
      { companyId, provider }
    );
  }

  return true;
}

/**
 * Resets in-memory sync status cache for unit testing isolation.
 */
export function resetSyncStatusCache(): void {
  inMemoryStore.clear();
  processedPayloadHashes.clear();
}
