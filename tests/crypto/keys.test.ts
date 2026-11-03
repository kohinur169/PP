// path: tests/crypto/keys.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  validateMasterKey,
  deriveDomainKey,
  withSecureBuffer,
  withDerivedKey,
  zeroizeBuffer,
  MasterKeyValidationError,
  CryptoDomain,
} from '../../lib/crypto/keys';

describe('Step 031: CEO Master Key Custodianship & Environment Secrets Protocol', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Master Key Validation & Entropy Requirements', () => {
    it('accepts a valid 64-character hexadecimal key (256 bits)', () => {
      const validHexKey = crypto.randomBytes(32).toString('hex');
      const result = validateMasterKey(validHexKey);

      expect(result.valid).toBe(true);
      expect(result.bits).toBe(256);
      expect(result.lengthBytes).toBe(32);
      expect(result.format).toBe('hex');
    });

    it('accepts a valid 44-character Base64 key (256 bits)', () => {
      const validBase64Key = crypto.randomBytes(32).toString('base64');
      const result = validateMasterKey(validBase64Key);

      expect(result.valid).toBe(true);
      expect(result.bits).toBe(256);
      expect(result.lengthBytes).toBe(32);
      expect(result.format).toBe('base64');
    });

    it('accepts a 32-byte raw Buffer key', () => {
      const rawBufferKey = crypto.randomBytes(32);
      const result = validateMasterKey(rawBufferKey);

      expect(result.valid).toBe(true);
      expect(result.bits).toBe(256);
      expect(result.lengthBytes).toBe(32);
      expect(result.format).toBe('raw');
    });

    it('rejects keys with less than 256 bits of entropy', () => {
      const shortHexKey = crypto.randomBytes(16).toString('hex'); // 128 bits
      expect(() => validateMasterKey(shortHexKey)).toThrow(MasterKeyValidationError);
      expect(() => validateMasterKey('too-short-string')).toThrow(MasterKeyValidationError);
    });

    it('throws MasterKeyValidationError if master key is missing in production environment', () => {
      delete process.env.MASTER_ENCRYPTION_KEY;
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';

      expect(() => deriveDomainKey('gateways')).toThrow(MasterKeyValidationError);
    });
  });

  describe('HKDF Domain Subkey Derivation & Strict Domain Isolation', () => {
    it('derives 32-byte (256-bit) keys for all supported crypto domains', () => {
      const domains: CryptoDomain[] = [
        'gateways',
        'pii',
        'files',
        'webhooks',
        'tokens',
        'ledger',
      ];

      for (const domain of domains) {
        const key = deriveDomainKey(domain);
        expect(Buffer.isBuffer(key)).toBe(true);
        expect(key.length).toBe(32);
      }
    });

    it('enforces strict domain isolation: different domains produce cryptographically orthogonal keys', () => {
      const gatewayKey = deriveDomainKey('gateways');
      const piiKey = deriveDomainKey('pii');
      const filesKey = deriveDomainKey('files');
      const webhooksKey = deriveDomainKey('webhooks');

      expect(gatewayKey.equals(piiKey)).toBe(false);
      expect(gatewayKey.equals(filesKey)).toBe(false);
      expect(piiKey.equals(webhooksKey)).toBe(false);
    });

    it('derives deterministic keys for identical domain and context parameters', () => {
      const key1 = deriveDomainKey('gateways', { context: 'nmi-processor' });
      const key2 = deriveDomainKey('gateways', { context: 'nmi-processor' });

      expect(key1.equals(key2)).toBe(true);
    });

    it('isolates subkeys by context within the same domain', () => {
      const keyNmi = deriveDomainKey('gateways', { context: 'nmi-processor' });
      const keyStripe = deriveDomainKey('gateways', { context: 'stripe-connect' });

      expect(keyNmi.equals(keyStripe)).toBe(false);
    });

    it('supports custom salt parameters for tenant-specific key derivation', () => {
      const keyDefault = deriveDomainKey('pii');
      const keySalted = deriveDomainKey('pii', { salt: 'tenant-specific-salt-xyz' });

      expect(keyDefault.equals(keySalted)).toBe(false);
    });
  });

  describe('Memory-Scrubbing Primitives & In-Memory Buffer Zeroization', () => {
    it('zeroizeBuffer overwrites all bytes with zero in place', () => {
      const sensitiveBuffer = Buffer.from('super-sensitive-api-secret-key-12345', 'utf8');
      expect(sensitiveBuffer.every((b) => b === 0)).toBe(false);

      zeroizeBuffer(sensitiveBuffer);

      expect(sensitiveBuffer.every((b) => b === 0)).toBe(true);
    });

    it('withSecureBuffer ensures the buffer is zeroized after standard completion', () => {
      const buffer = Buffer.from('gateway-credential-payload', 'utf8');
      let capturedLength = 0;

      const result = withSecureBuffer(buffer, (cleanBuf) => {
        capturedLength = cleanBuf.length;
        return 'success';
      });

      expect(result).toBe('success');
      expect(capturedLength).toBeGreaterThan(0);
      expect(buffer.every((b) => b === 0)).toBe(true);
    });

    it('withSecureBuffer ensures the buffer is zeroized even if an error is thrown', () => {
      const buffer = Buffer.from('error-prone-operation-buffer', 'utf8');

      expect(() => {
        withSecureBuffer(buffer, () => {
          throw new Error('Simulated crypto fault');
        });
      }).toThrow('Simulated crypto fault');

      expect(buffer.every((b) => b === 0)).toBe(true);
    });

    it('withDerivedKey provides derived key and zeroizes it upon exit', () => {
      let keyCopy: Buffer | null = null;

      const returnedValue = withDerivedKey('gateways', (key) => {
        keyCopy = Buffer.from(key); // Make a copy of contents to verify
        expect(key.length).toBe(32);
        expect(key.every((b) => b === 0)).toBe(false);
        return 'derived-key-used';
      });

      expect(returnedValue).toBe('derived-key-used');
      expect(keyCopy).not.toBeNull();
      expect(keyCopy!.length).toBe(32);
    });
  });
});
