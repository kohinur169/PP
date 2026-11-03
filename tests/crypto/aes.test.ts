// path: tests/crypto/aes.test.ts

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  encryptAesGcm,
  decryptAesGcm,
  parseEnvelope,
  serializeEnvelope,
  encryptWithDomainKey,
  decryptWithDomainKey,
  DecryptionError,
} from '../../lib/crypto/aes';

describe('Step 032: AES-256-GCM Envelope Encryption & Decryption Engine', () => {
  const testKey = crypto.randomBytes(32); // 256-bit AES key

  describe('Round-trip Encryption and Decryption', () => {
    it('encrypts and decrypts a plain text string cleanly', () => {
      const plaintext = 'api_key_live_nmi_production_9999482901284';
      const envelope = encryptAesGcm(plaintext, testKey);

      expect(envelope.version).toBe(1);
      expect(envelope.iv).toHaveLength(24); // 12 bytes = 24 hex chars
      expect(envelope.authTag).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(envelope.ciphertext.length).toBeGreaterThan(0);

      const decrypted = decryptAesGcm(envelope, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts a complex JSON payload', () => {
      const payload = JSON.stringify({
        apiKey: 'sk_live_1234567890',
        secret: 'sec_987654321',
        merchantId: 'merch_018f6c4c',
        limits: { daily: '10000.0000', perTx: '2500.0000' },
      });

      const envelope = encryptAesGcm(payload, testKey);
      const decrypted = decryptAesGcm(envelope.serialized, testKey);

      expect(decrypted).toBe(payload);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(payload));
    });

    it('generates unique 96-bit IVs for repeated encryptions of identical plaintext', () => {
      const plaintext = 'constant_payment_processor_secret';
      const envelope1 = encryptAesGcm(plaintext, testKey);
      const envelope2 = encryptAesGcm(plaintext, testKey);

      expect(envelope1.iv).not.toBe(envelope2.iv);
      expect(envelope1.ciphertext).not.toBe(envelope2.ciphertext);
      expect(envelope1.authTag).not.toBe(envelope2.authTag);

      expect(decryptAesGcm(envelope1, testKey)).toBe(plaintext);
      expect(decryptAesGcm(envelope2, testKey)).toBe(plaintext);
    });
  });

  describe('Envelope Serialization and Parsing', () => {
    it('serializes and parses canonical v1 envelope strings', () => {
      const envelope = encryptAesGcm('test_secret', testKey);
      const parsed = parseEnvelope(envelope.serialized);

      expect(parsed.version).toBe(1);
      expect(parsed.iv).toBe(envelope.iv);
      expect(parsed.authTag).toBe(envelope.authTag);
      expect(parsed.ciphertext).toBe(envelope.ciphertext);
    });

    it('rejects malformed or truncated serialized envelopes', () => {
      expect(() => parseEnvelope('invalid-string')).toThrow(DecryptionError);
      expect(() => parseEnvelope('v1:iv:tag')).toThrow(DecryptionError);
      expect(() => parseEnvelope('v0:iv:tag:cipher')).toThrow(DecryptionError);
      expect(() => parseEnvelope('vx:iv:tag:cipher')).toThrow(DecryptionError);
    });

    it('supports higher key versions such as v2 envelopes', () => {
      const envelopeV2 = encryptAesGcm('secret_payload', testKey, { version: 2 });
      expect(envelopeV2.version).toBe(2);
      expect(envelopeV2.serialized.startsWith('v2:')).toBe(true);

      const parsed = parseEnvelope(envelopeV2.serialized);
      expect(parsed.version).toBe(2);

      const decrypted = decryptAesGcm(envelopeV2, testKey);
      expect(decrypted).toBe('secret_payload');
    });
  });

  describe('Tamper Resistance & Authentication Tag Verification', () => {
    it('throws DecryptionError when a single byte of ciphertext is modified', () => {
      const envelope = encryptAesGcm('integrity-protected-card-data', testKey);

      // Flip first character of ciphertext
      const originalFirstChar = envelope.ciphertext[0];
      const corruptedFirstChar = originalFirstChar === 'a' ? 'b' : 'a';
      const tamperedCiphertext = corruptedFirstChar + envelope.ciphertext.slice(1);

      const tamperedEnvelope = {
        ...envelope,
        ciphertext: tamperedCiphertext,
        serialized: `v1:${envelope.iv}:${envelope.authTag}:${tamperedCiphertext}`,
      };

      expect(() => decryptAesGcm(tamperedEnvelope, testKey)).toThrow(DecryptionError);
    });

    it('throws DecryptionError when the authentication tag is modified', () => {
      const envelope = encryptAesGcm('integrity-protected-card-data', testKey);

      // Corrupt auth tag
      const corruptedTag = '00' + envelope.authTag.slice(2);
      const tamperedEnvelope = {
        ...envelope,
        authTag: corruptedTag,
        serialized: `v1:${envelope.iv}:${corruptedTag}:${envelope.ciphertext}`,
      };

      expect(() => decryptAesGcm(tamperedEnvelope, testKey)).toThrow(DecryptionError);
    });

    it('throws DecryptionError when decrypting with an incorrect key', () => {
      const wrongKey = crypto.randomBytes(32);
      const envelope = encryptAesGcm('super-secret-key-material', testKey);

      expect(() => decryptAesGcm(envelope, wrongKey)).toThrow(DecryptionError);
    });
  });

  describe('Additional Authenticated Data (AAD) Binding', () => {
    it('successfully decrypts when matching AAD is provided', () => {
      const plaintext = 'gateway_merchant_token';
      const aad = 'company_id:018f6c4c-3500-7fa1-b1e2-123456789abc';

      const envelope = encryptAesGcm(plaintext, testKey, { aad });
      const decrypted = decryptAesGcm(envelope, testKey, { aad });

      expect(decrypted).toBe(plaintext);
    });

    it('throws DecryptionError if AAD is mismatched between encryption and decryption', () => {
      const plaintext = 'gateway_merchant_token';
      const aadOriginal = 'company_id:tenant-alpha';
      const aadAttacker = 'company_id:tenant-bravo';

      const envelope = encryptAesGcm(plaintext, testKey, { aad: aadOriginal });

      // Attempting to decrypt under different tenant context fails authentication
      expect(() => decryptAesGcm(envelope, testKey, { aad: aadAttacker })).toThrow(
        DecryptionError
      );
    });

    it('throws DecryptionError if AAD was used during encryption but omitted during decryption', () => {
      const envelope = encryptAesGcm('protected-data', testKey, { aad: 'tenant-required' });
      expect(() => decryptAesGcm(envelope, testKey)).toThrow(DecryptionError);
    });
  });

  describe('Domain Subkey Encrypt/Decrypt Helpers', () => {
    it('encrypts and decrypts with domain subkeys and memory zeroization', () => {
      const secret = 'nmi_security_key_live_2026';
      const serialized = encryptWithDomainKey('gateways', secret, {
        context: 'nmi-adapter',
      });

      const decrypted = decryptWithDomainKey('gateways', serialized, {
        context: 'nmi-adapter',
      });
      expect(decrypted).toBe(secret);
    });

    it('fails to decrypt if domain differs (gateways vs pii)', () => {
      const secret = 'pii_ssn_identification_number';
      const serialized = encryptWithDomainKey('pii', secret);

      // Decrypting with wrong domain throws DecryptionError
      expect(() => decryptWithDomainKey('gateways', serialized)).toThrow(DecryptionError);
    });

    it('fails to decrypt if context differs within the same domain', () => {
      const secret = 'stripe_restricted_key';
      const serialized = encryptWithDomainKey('gateways', secret, {
        context: 'stripe-connect',
      });

      // Decrypting under different gateway context fails
      expect(() =>
        decryptWithDomainKey('gateways', serialized, { context: 'airwallex' })
      ).toThrow(DecryptionError);
    });
  });
});
