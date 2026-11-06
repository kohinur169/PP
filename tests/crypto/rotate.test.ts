// path: tests/crypto/rotate.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  rotateEncryptedPayload,
  verifyRotationPreconditions,
  batchRotateCredentials,
  recordKeyRotationAudit,
} from '../../lib/crypto/rotate';
import { encryptAesGcm, decryptAesGcm, DecryptionError } from '../../lib/crypto/aes';
import { AuditLogRepository } from '../../lib/db/audit';

describe('Step 034: Automated Key Rotation Pipeline for Stored Credentials', () => {
  const keyV1 = crypto.randomBytes(32);
  const keyV2 = crypto.randomBytes(32);
  let auditRepo: AuditLogRepository;

  beforeEach(() => {
    auditRepo = new AuditLogRepository();
  });

  describe('Single Envelope Key Rotation', () => {
    it('re-encrypts a payload from Key V1 to Key V2 and advances envelope version', () => {
      const plaintext = 'nmi_production_secret_key_9988';
      const envelopeV1 = encryptAesGcm(plaintext, keyV1, { version: 1 });

      const rotatedV2 = rotateEncryptedPayload(envelopeV1.serialized, keyV1, keyV2);

      // Verify envelope version incremented to v2
      expect(rotatedV2.startsWith('v2:')).toBe(true);

      // Verifies decryption succeeds under Key V2
      const decryptedV2 = decryptAesGcm(rotatedV2, keyV2);
      expect(decryptedV2).toBe(plaintext);

      // Verifies old Key V1 can no longer decrypt the rotated payload
      expect(() => decryptAesGcm(rotatedV2, keyV1)).toThrow(DecryptionError);
    });

    it('preserves and enforces Additional Authenticated Data (AAD) across rotation', () => {
      const secret = 'stripe_restricted_token';
      const aad = 'company_id:018f6c4c-3500-7fa1-b1e2-123456789abc';

      const envelopeV1 = encryptAesGcm(secret, keyV1, { version: 1, aad });
      const rotatedV2 = rotateEncryptedPayload(envelopeV1.serialized, keyV1, keyV2, { aad });

      // Decryption under Key V2 with matching AAD succeeds
      expect(decryptAesGcm(rotatedV2, keyV2, { aad })).toBe(secret);

      // Decryption under Key V2 with mismatched AAD fails
      expect(() =>
        decryptAesGcm(rotatedV2, keyV2, { aad: 'company_id:wrong-tenant' })
      ).toThrow(DecryptionError);
    });
  });

  describe('Pre-rotation Precondition Verification', () => {
    it('passes when both keys are valid 32-byte buffers and canary payload decrypts', () => {
      const sample = encryptAesGcm('canary_payload', keyV1, { version: 1 }).serialized;
      const result = verifyRotationPreconditions(keyV1, keyV2, sample);

      expect(result.valid).toBe(true);
      expect(result.currentVersion).toBe(1);
      expect(result.newVersion).toBe(2);
    });

    it('throws error if new key is identical to current key', () => {
      const sample = encryptAesGcm('canary_payload', keyV1).serialized;
      expect(() => verifyRotationPreconditions(keyV1, keyV1, sample)).toThrow(
        'Rotation aborted: New key is identical to current key.'
      );
    });

    it('throws error if current key cannot decrypt the sample payload', () => {
      const wrongKey = crypto.randomBytes(32);
      const sample = encryptAesGcm('canary_payload', wrongKey).serialized;

      expect(() => verifyRotationPreconditions(keyV1, keyV2, sample)).toThrow(
        'Pre-rotation test failed: Current key unable to decrypt sample payload.'
      );
    });
  });

  describe('Batch Credential Re-Encryption', () => {
    it('re-encrypts multiple credentials atomically and reports counts', () => {
      const items = [
        {
          id: 'cred_1',
          encryptedValue: encryptAesGcm('key_one', keyV1).serialized,
        },
        {
          id: 'cred_2',
          encryptedValue: encryptAesGcm('key_two', keyV1).serialized,
        },
        {
          id: 'cred_3',
          encryptedValue: encryptAesGcm('key_three', keyV1).serialized,
        },
      ];

      const result = batchRotateCredentials(items, keyV1, keyV2);

      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.rotatedItems).toHaveLength(3);

      for (const rotated of result.rotatedItems) {
        expect(rotated.newEncryptedValue.startsWith('v2:')).toBe(true);
      }
    });

    it('records individual failures when encountering corrupt payloads without halting', () => {
      const items = [
        {
          id: 'cred_valid',
          encryptedValue: encryptAesGcm('valid_key', keyV1).serialized,
        },
        {
          id: 'cred_corrupted',
          encryptedValue: 'v1:corrupted:hex:payload',
        },
      ];

      const result = batchRotateCredentials(items, keyV1, keyV2);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.id).toBe('cred_corrupted');
    });
  });

  describe('Audit Trail Recording for Key Rotation', () => {
    it('appends an audit log entry detailing the key version transition', async () => {
      const auditEntry = await recordKeyRotationAudit({
        auditRepo,
        actorId: '00000000-0000-7000-8000-000000000001',
        fromVersion: 1,
        toVersion: 2,
        affectedCount: 42,
        domain: 'gateways',
      });

      expect(auditEntry.action).toBe('CREDENTIAL_KEY_ROTATION_COMPLETED');
      expect(auditEntry.entity_type).toBe('SecurityKey');
      expect(auditEntry.payload).toEqual({
        domain: 'gateways',
        from_version: 1,
        to_version: 2,
        affected_record_count: 42,
        rotation_timestamp: expect.any(String),
      });
      expect(auditEntry.sequence_id).toBe(1);
      expect(auditEntry.current_hash).toBeDefined();
    });
  });
});
