// path: lib/api/api-keys.ts

import { createHash, randomBytes } from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type ApiKeyEnvironment = 'live' | 'test';
export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

export interface MerchantApiKeyRecord {
  id: string;
  tenantId: string;
  companyId: string;
  name: string;
  publishableKey: string;
  keyHash: string;
  maskedSecretKey: string;
  environment: ApiKeyEnvironment;
  status: ApiKeyStatus;
  createdBy: string;
  revokedBy?: string | undefined;
  revokedAt?: string | undefined;
  lastUsedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyInput {
  tenantId: string;
  companyId: string;
  name?: string | undefined;
  environment?: ApiKeyEnvironment | undefined;
  createdBy: string;
}

export interface CreateApiKeyResult {
  record: MerchantApiKeyRecord;
  plaintextSecretKey: string; // Only provided once upon creation/regeneration
}

export interface RevokeApiKeyInput {
  keyId: string;
  revokedBy: string;
  revokerRole: string;
}

export interface RegenerateApiKeyInput {
  keyId: string;
  regeneratedBy: string;
  regeneratorRole: string;
}

export class InvalidApiKeyAuthenticationError extends Error {
  public readonly code = 'INVALID_API_KEY_AUTHENTICATION';
  public readonly statusCode = 401;

  constructor(message = 'Invalid or revoked API credentials.') {
    super(message);
    this.name = 'InvalidApiKeyAuthenticationError';
  }
}

const keyStoreById = new Map<string, MerchantApiKeyRecord>();
const keyStoreByHash = new Map<string, MerchantApiKeyRecord>();
const keyStoreByPub = new Map<string, MerchantApiKeyRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Computes SHA-256 hash of API secret key.
 */
export function hashSecretKey(secretKey: string): string {
  return createHash('sha256').update(secretKey).digest('hex');
}

/**
 * Masks API secret key.
 * Format: `sk_live_••••••••••••` + last 4 characters.
 * Section 20: "After creation they are shown masked only and never appear in UI, logs or error messages."
 */
export function maskSecretKey(secretKey: string, environment: ApiKeyEnvironment): string {
  const last4 = secretKey.slice(-4);
  const prefix = environment === 'live' ? 'sk_live_' : 'sk_test_';
  return `${prefix}••••••••••••${last4}`;
}

/**
 * Generates random publishable and secret keys.
 */
function generateKeyPairs(environment: ApiKeyEnvironment): {
  publishableKey: string;
  plaintextSecretKey: string;
  maskedSecretKey: string;
  keyHash: string;
} {
  const envPrefix = environment === 'live' ? 'live' : 'test';
  const pubRandom = randomBytes(16).toString('hex');
  const secRandom = randomBytes(24).toString('hex');

  const publishableKey = `pk_${envPrefix}_${pubRandom}`;
  const plaintextSecretKey = `sk_${envPrefix}_${secRandom}`;
  const keyHash = hashSecretKey(plaintextSecretKey);
  const maskedSecretKey = maskSecretKey(plaintextSecretKey, environment);

  return {
    publishableKey,
    plaintextSecretKey,
    maskedSecretKey,
    keyHash,
  };
}

/**
 * Step 145.1: Generates new merchant public API credentials.
 * Plaintext secret key is returned ONCE in result; database strictly stores keyHash and maskedSecretKey.
 */
export async function createMerchantApiKey(
  input: CreateApiKeyInput
): Promise<CreateApiKeyResult> {
  const environment: ApiKeyEnvironment = input.environment ?? 'live';
  const name = input.name ?? 'Online Store API Key';

  const { publishableKey, plaintextSecretKey, maskedSecretKey, keyHash } =
    generateKeyPairs(environment);

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: MerchantApiKeyRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    name,
    publishableKey,
    keyHash,
    maskedSecretKey,
    environment,
    status: 'active',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  keyStoreById.set(id, record);
  keyStoreByHash.set(keyHash, record);
  keyStoreByPub.set(publishableKey, record);

  logger.info('Merchant public API key created', {
    keyId: id,
    companyId: input.companyId,
    publishableKey,
    maskedSecretKey,
    environment,
  });

  try {
    await auditRepo.append({
      actor_id: input.createdBy,
      action: 'MERCHANT_API_KEY_CREATED',
      entity_type: 'merchant_api_key',
      entity_id: id,
      payload: {
        companyId: input.companyId,
        publishableKey,
        maskedSecretKey,
        environment,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for API key creation', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    record,
    plaintextSecretKey,
  };
}

/**
 * Step 145.2: Revokes an active merchant API key.
 */
export async function revokeMerchantApiKey(
  input: RevokeApiKeyInput
): Promise<MerchantApiKeyRecord> {
  const record = keyStoreById.get(input.keyId);
  if (!record) {
    throw new Error(`API key with ID '${input.keyId}' was not found.`);
  }

  if (record.status === 'revoked') {
    return record;
  }

  const now = new Date().toISOString();
  record.status = 'revoked';
  record.revokedBy = input.revokedBy;
  record.revokedAt = now;
  record.updatedAt = now;

  logger.warn('Merchant API key revoked', {
    keyId: record.id,
    companyId: record.companyId,
    revokedBy: input.revokedBy,
  });

  try {
    await auditRepo.append({
      actor_id: input.revokedBy,
      action: 'MERCHANT_API_KEY_REVOKED',
      entity_type: 'merchant_api_key',
      entity_id: record.id,
      payload: {
        companyId: record.companyId,
        publishableKey: record.publishableKey,
        revokedBy: input.revokedBy,
        revokerRole: input.revokerRole,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for API key revocation', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 145.3: Regenerates merchant API credentials.
 * Automatically revokes existing secret key and issues fresh key pair.
 */
export async function regenerateMerchantApiKey(
  input: RegenerateApiKeyInput
): Promise<CreateApiKeyResult> {
  const oldRecord = keyStoreById.get(input.keyId);
  if (!oldRecord) {
    throw new Error(`API key with ID '${input.keyId}' was not found.`);
  }

  // Revoke old credentials
  await revokeMerchantApiKey({
    keyId: input.keyId,
    revokedBy: input.regeneratedBy,
    revokerRole: input.regeneratorRole,
  });

  // Create replacement key pair with same company and environment
  const fresh = await createMerchantApiKey({
    tenantId: oldRecord.tenantId,
    companyId: oldRecord.companyId,
    name: `${oldRecord.name} (Regenerated)`,
    environment: oldRecord.environment,
    createdBy: input.regeneratedBy,
  });

  logger.info('Merchant API key regenerated successfully', {
    oldKeyId: oldRecord.id,
    newKeyId: fresh.record.id,
    companyId: oldRecord.companyId,
  });

  try {
    await auditRepo.append({
      actor_id: input.regeneratedBy,
      action: 'MERCHANT_API_KEY_REGENERATED',
      entity_type: 'merchant_api_key',
      entity_id: fresh.record.id,
      payload: {
        oldKeyId: oldRecord.id,
        newKeyId: fresh.record.id,
        companyId: oldRecord.companyId,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for API key regeneration', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return fresh;
}

/**
 * Step 145.4: Authenticates an incoming client API key.
 * Checks whether secret key hash or publishable key matches an active record.
 * Throws InvalidApiKeyAuthenticationError without leaking secret values.
 */
export async function authenticateApiKey(
  providedKey: string
): Promise<MerchantApiKeyRecord> {
  if (!providedKey || typeof providedKey !== 'string') {
    throw new InvalidApiKeyAuthenticationError();
  }

  const trimmed = providedKey.trim();

  let record: MerchantApiKeyRecord | undefined;

  if (trimmed.startsWith('sk_')) {
    const hash = hashSecretKey(trimmed);
    record = keyStoreByHash.get(hash);
  } else if (trimmed.startsWith('pk_')) {
    record = keyStoreByPub.get(trimmed);
  } else {
    throw new InvalidApiKeyAuthenticationError();
  }

  if (!record || record.status !== 'active') {
    throw new InvalidApiKeyAuthenticationError(
      'Authentication failed: Provided API key is invalid, revoked, or expired.'
    );
  }

  record.lastUsedAt = new Date().toISOString();
  return record;
}

/**
 * Retrieves an API key record by ID (masked secret only).
 */
export async function getMerchantApiKey(
  keyId: string
): Promise<MerchantApiKeyRecord | null> {
  return keyStoreById.get(keyId) ?? null;
}

/**
 * Lists all API keys for a merchant company (masked secret only).
 */
export async function listMerchantApiKeys(
  companyId: string
): Promise<MerchantApiKeyRecord[]> {
  const result: MerchantApiKeyRecord[] = [];
  for (const record of keyStoreById.values()) {
    if (record.companyId === companyId) {
      result.push(record);
    }
  }
  return result;
}

/**
 * Resets the in-memory API key store for test isolation.
 */
export function resetApiKeyStore(): void {
  keyStoreById.clear();
  keyStoreByHash.clear();
  keyStoreByPub.clear();
}
