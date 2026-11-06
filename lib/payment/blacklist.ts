// path: lib/payment/blacklist.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type BlacklistCategory =
  | 'fraud'
  | 'stolen_card'
  | 'excessive_chargebacks'
  | 'compliance_sanction'
  | 'manual_block';

export class BlacklistedCardError extends Error {
  readonly code = 'CARD_BLACKLISTED';
  readonly httpStatus = 403;
  readonly cardFingerprint: string;
  readonly reason: string;
  readonly category: BlacklistCategory;

  constructor(cardFingerprint: string, reason: string, category: BlacklistCategory) {
    super(
      `[Security Guard: Card Blacklist] Payment rejected: card fingerprint '${cardFingerprint}' is blacklisted (${category}: ${reason}).`
    );
    this.name = 'BlacklistedCardError';
    this.cardFingerprint = cardFingerprint;
    this.reason = reason;
    this.category = category;
  }
}

export interface BlacklistedCardRecord {
  id: string;
  tenantId: string;
  cardFingerprint: string;
  reason: string;
  category: BlacklistCategory;
  addedBy: string;
  addedByEmail?: string | undefined;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AddToBlacklistParams {
  tenantId: string;
  cardFingerprint: string;
  reason: string;
  category?: BlacklistCategory | undefined;
  addedByUserId: string;
  addedByEmail?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RemoveFromBlacklistParams {
  tenantId: string;
  cardFingerprint: string;
  removedByUserId: string;
  justification: string;
}

// In-memory runtime storage for fast authorization lookups and test isolation
const blacklistStore = new Map<string, BlacklistedCardRecord>();
const auditRepo = new AuditLogRepository();

function normalizeFingerprint(fingerprint: string): string {
  return fingerprint.trim().toLowerCase();
}

/**
 * Step 137.2: Pre-charge check verifying whether a card fingerprint or token hash is blacklisted.
 * Evaluated before reaching any external gateway API.
 */
export async function isCardBlacklisted(
  cardFingerprint: string | undefined
): Promise<{ isBlacklisted: boolean; record?: BlacklistedCardRecord | undefined }> {
  if (!cardFingerprint || !cardFingerprint.trim()) {
    return { isBlacklisted: false };
  }

  const cleanFingerprint = normalizeFingerprint(cardFingerprint);
  const record = blacklistStore.get(cleanFingerprint);

  if (record && record.isActive) {
    return { isBlacklisted: true, record };
  }

  return { isBlacklisted: false };
}

/**
 * Asserts that a card is not blacklisted.
 * Throws BlacklistedCardError immediately if blacklisted.
 */
export async function assertCardNotBlacklisted(cardFingerprint: string | undefined): Promise<void> {
  const check = await isCardBlacklisted(cardFingerprint);
  if (check.isBlacklisted && check.record) {
    logger.warn('Pre-charge authorization blocked: card fingerprint is globally blacklisted', {
      cardFingerprint,
      category: check.record.category,
      reason: check.record.reason,
    });

    throw new BlacklistedCardError(
      cardFingerprint!,
      check.record.reason,
      check.record.category
    );
  }
}

/**
 * Step 137.3: Adds a card fingerprint to the global blacklist with mandatory justification notes.
 */
export async function addCardToBlacklist(
  params: AddToBlacklistParams
): Promise<BlacklistedCardRecord> {
  if (!params.cardFingerprint || !params.cardFingerprint.trim()) {
    throw new Error('Card fingerprint is required to add card to blacklist.');
  }

  if (!params.reason || params.reason.trim().length < 5) {
    throw new Error('A detailed justification reason (minimum 5 characters) is mandatory to blacklist a card.');
  }

  const cleanFingerprint = normalizeFingerprint(params.cardFingerprint);
  const now = new Date().toISOString();
  const id = generateUuidV7();
  const category = params.category ?? 'fraud';

  const record: BlacklistedCardRecord = {
    id,
    tenantId: params.tenantId,
    cardFingerprint: cleanFingerprint,
    reason: params.reason.trim(),
    category,
    addedBy: params.addedByUserId,
    addedByEmail: params.addedByEmail,
    isActive: true,
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  blacklistStore.set(cleanFingerprint, record);

  // Step 137.4: Audit log entry with justification notes
  try {
    await auditRepo.append({
      actor_id: params.addedByUserId,
      action: 'CARD_BLACKLISTED',
      entity_type: 'card_blacklist',
      entity_id: id,
      payload: {
        cardFingerprint: cleanFingerprint,
        reason: record.reason,
        category: record.category,
        addedByEmail: params.addedByEmail,
      },
    });
  } catch (auditErr: unknown) {
    logger.warn('Failed to append audit record for card blacklisting', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  logger.info('Card fingerprint added to blacklist', {
    cardFingerprint: cleanFingerprint,
    category: record.category,
    addedBy: params.addedByUserId,
  });

  return record;
}

/**
 * Step 137.3: Removes a card from the blacklist with mandatory justification.
 */
export async function removeCardFromBlacklist(
  params: RemoveFromBlacklistParams
): Promise<boolean> {
  if (!params.justification || params.justification.trim().length < 5) {
    throw new Error('A detailed removal justification (minimum 5 characters) is mandatory.');
  }

  const cleanFingerprint = normalizeFingerprint(params.cardFingerprint);
  const existing = blacklistStore.get(cleanFingerprint);

  if (!existing || !existing.isActive) {
    return false;
  }

  existing.isActive = false;
  existing.updatedAt = new Date().toISOString();

  // Audit log entry
  try {
    await auditRepo.append({
      actor_id: params.removedByUserId,
      action: 'CARD_UNBLACKLISTED',
      entity_type: 'card_blacklist',
      entity_id: existing.id,
      payload: {
        cardFingerprint: cleanFingerprint,
        justification: params.justification,
        previousCategory: existing.category,
      },
    });
  } catch (auditErr: unknown) {
    logger.warn('Failed to append audit record for card un-blacklisting', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  logger.info('Card fingerprint removed from blacklist', {
    cardFingerprint: cleanFingerprint,
    removedBy: params.removedByUserId,
    justification: params.justification,
  });

  return true;
}

/**
 * Lists all active blacklisted cards (for Super Admin dashboard).
 */
export async function listBlacklistedCards(options?: {
  activeOnly?: boolean | undefined;
  category?: BlacklistCategory | undefined;
}): Promise<BlacklistedCardRecord[]> {
  const activeOnly = options?.activeOnly !== false;
  let records = Array.from(blacklistStore.values());

  if (activeOnly) {
    records = records.filter((r) => r.isActive);
  }

  if (options?.category) {
    records = records.filter((r) => r.category === options.category);
  }

  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Resets in-memory blacklist store for test isolation.
 */
export function resetBlacklistStore(): void {
  blacklistStore.clear();
}
