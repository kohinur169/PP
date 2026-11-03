// path: lib/crypto/rotate.ts

import {
  parseEnvelope,
  encryptAesGcm,
  decryptAesGcm,
  DecryptionError,
} from './aes';
import { AuditLogRepository } from '../db/audit';
import type { AuditLogEntity } from '../../types/audit';

export interface RotationPreconditionResult {
  readonly valid: boolean;
  readonly currentVersion: number;
  readonly newVersion: number;
}

export interface CredentialRotationItem {
  readonly id: string;
  readonly encryptedValue: string;
  readonly aad?: string | Buffer | undefined;
}

export interface CredentialRotationResult<T extends CredentialRotationItem> {
  readonly rotatedItems: Array<T & { newEncryptedValue: string }>;
  readonly successCount: number;
  readonly failureCount: number;
  readonly errors: Array<{ id: string; error: string }>;
}

export interface KeyRotationAuditParams {
  readonly actorId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly affectedCount: number;
  readonly domain: string;
  readonly companyId?: string | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

/**
 * Re-encrypts a single AES-256-GCM encrypted envelope under a new encryption key.
 * Advances envelope version (e.g. from v1 to v2) while preserving AAD authentication.
 */
export function rotateEncryptedPayload(
  serializedPayload: string,
  currentKey: Buffer,
  newKey: Buffer,
  options?: {
    readonly aad?: string | Buffer | undefined;
    readonly newVersion?: number | undefined;
  }
): string {
  const envelope = parseEnvelope(serializedPayload);
  const plaintext = decryptAesGcm(envelope, currentKey, { aad: options?.aad });

  const nextVersion = options?.newVersion ?? envelope.version + 1;
  const newEnvelope = encryptAesGcm(plaintext, newKey, {
    aad: options?.aad,
    version: nextVersion,
  });

  return newEnvelope.serialized;
}

/**
 * Validates cryptographic pre-conditions prior to executing a batch key rotation:
 * 1. Checks that both currentKey and newKey are 32-byte (256-bit) buffers and not identical.
 * 2. Confirms that currentKey can decrypt the sample payload.
 * 3. Verifies that newKey can encrypt and decrypt test data cleanly.
 */
export function verifyRotationPreconditions(
  currentKey: Buffer,
  newKey: Buffer,
  sampleEncrypted: string,
  options?: { readonly aad?: string | Buffer | undefined }
): RotationPreconditionResult {
  if (!Buffer.isBuffer(currentKey) || currentKey.length !== 32) {
    throw new Error('Current encryption key must be a valid 32-byte (256-bit) Buffer.');
  }
  if (!Buffer.isBuffer(newKey) || newKey.length !== 32) {
    throw new Error('New encryption key must be a valid 32-byte (256-bit) Buffer.');
  }
  if (currentKey.equals(newKey)) {
    throw new Error('Rotation aborted: New key is identical to current key.');
  }

  const envelope = parseEnvelope(sampleEncrypted);

  // Test decryption under current key
  try {
    decryptAesGcm(envelope, currentKey, { aad: options?.aad });
  } catch (err) {
    throw new Error(
      `Pre-rotation test failed: Current key unable to decrypt sample payload. Reason: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Test round-trip under new key
  const testPlaintext = 'test_rotation_canary_value';
  const testEnvelope = encryptAesGcm(testPlaintext, newKey, { version: envelope.version + 1 });
  const testDecrypted = decryptAesGcm(testEnvelope, newKey);

  if (testDecrypted !== testPlaintext) {
    throw new Error('Pre-rotation test failed: New key unable to perform round-trip encryption.');
  }

  return {
    valid: true,
    currentVersion: envelope.version,
    newVersion: envelope.version + 1,
  };
}

/**
 * Executes batch re-encryption of a collection of encrypted credentials.
 * Tracks individual item successes and failures atomically.
 */
export function batchRotateCredentials<T extends CredentialRotationItem>(
  items: T[],
  currentKey: Buffer,
  newKey: Buffer,
  options?: { readonly newVersion?: number | undefined }
): CredentialRotationResult<T> {
  const rotatedItems: Array<T & { newEncryptedValue: string }> = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const item of items) {
    try {
      const newEncryptedValue = rotateEncryptedPayload(
        item.encryptedValue,
        currentKey,
        newKey,
        {
          aad: item.aad,
          newVersion: options?.newVersion,
        }
      );

      rotatedItems.push({
        ...item,
        newEncryptedValue,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({
        id: item.id,
        error: errorMsg,
      });
    }
  }

  return {
    rotatedItems,
    successCount: rotatedItems.length,
    failureCount: errors.length,
    errors,
  };
}

/**
 * Records a credential key rotation event in the append-only cryptographic audit trail.
 */
export async function recordKeyRotationAudit(
  params: KeyRotationAuditParams
): Promise<AuditLogEntity> {
  const auditRepo = params.auditRepo ?? new AuditLogRepository();

  return await auditRepo.append({
    company_id: params.companyId ?? '00000000-0000-7000-8000-000000000000',
    actor_id: params.actorId,
    action: 'CREDENTIAL_KEY_ROTATION_COMPLETED',
    entity_type: 'SecurityKey',
    entity_id: `domain:${params.domain}`,
    payload: {
      domain: params.domain,
      from_version: params.fromVersion,
      to_version: params.toVersion,
      affected_record_count: params.affectedCount,
      rotation_timestamp: new Date().toISOString(),
    },
    ip_address: '127.0.0.1',
    user_agent: 'KD-Solution-Key-Rotation-Engine/1.0',
  });
}
