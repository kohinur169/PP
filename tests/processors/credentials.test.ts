// path: tests/processors/credentials.test.ts

import { describe, it, expect } from 'vitest';
import {
  encryptGatewaySecret,
  decryptGatewaySecret,
  formatMaskedGatewaySecret,
  saveGatewayCredential,
  getMaskedGatewayCredentials,
} from '@/lib/processors/credentials';

describe('Step 121: AES-256-GCM Gateway Credential Encryption & Masked UI', () => {
  const tenantId = '01a1aa91-3500-7fa1-b1e2-123456789abc';
  const otherTenantId = '01a1aa91-3500-7fa1-b1e2-999999999def';
  const rawStripeSecret = 'sec_test_mock_stripe_key_881920481024';

  describe('Step 121.1: Cryptographic Envelope & Domain Subkey Derivation', () => {
    it('encrypts gateway secret using AES-256-GCM authenticated with tenant context', () => {
      const envelope = encryptGatewaySecret(rawStripeSecret, tenantId);

      expect(envelope.encryptedPayload).toBeDefined();
      expect(envelope.encryptedPayload).toContain('v1:'); // Serialized AES-256-GCM envelope
      expect(envelope.encryptedPayload).not.toContain(rawStripeSecret);
      expect(envelope.last4).toBe('1024'); // Last 4 chars
    });

    it('decrypts encrypted payload cleanly with matching tenantId context', () => {
      const envelope = encryptGatewaySecret(rawStripeSecret, tenantId);
      const decrypted = decryptGatewaySecret(envelope.encryptedPayload, tenantId);

      expect(decrypted).toBe(rawStripeSecret);
    });

    it('fails decryption if wrong tenant context is provided (authentication tag validation)', () => {
      const envelope = encryptGatewaySecret(rawStripeSecret, tenantId);

      expect(() => {
        decryptGatewaySecret(envelope.encryptedPayload, otherTenantId);
      }).toThrow();
    });

    it('throws error when attempting to encrypt empty string', () => {
      expect(() => encryptGatewaySecret('', tenantId)).toThrow(/must not be empty/i);
    });
  });

  describe('Step 121.2: Secret Masking Display Format', () => {
    it('masks full key displaying 12 bullets and trailing characters', () => {
      const masked = formatMaskedGatewaySecret(rawStripeSecret);
      expect(masked).toContain('••••••••••••');
      expect(masked.endsWith('1024')).toBe(true);
      expect(masked).not.toContain('mock_stripe');
    });

    it('completely masks short secrets to prevent length leakage', () => {
      const shortMasked = formatMaskedGatewaySecret('abc');
      expect(shortMasked).toBe('••••••••••••');
    });
  });

  describe('Step 121.3: Secure Storage & Retrieval Flow', () => {
    it('saves encrypted credential and returns record with masked last4', async () => {
      const record = await saveGatewayCredential({
        tenantId,
        providerSlug: 'stripe_connect',
        credentialType: 'secret_key',
        secretValue: rawStripeSecret,
        environment: 'sandbox',
      });

      expect(record.id).toBeDefined();
      expect(record.tenantId).toBe(tenantId);
      expect(record.providerSlug).toBe('stripe_connect');
      expect(record.credentialType).toBe('secret_key');
      expect(record.last4).toBe('1024');
      expect(record.isActive).toBe(true);

      // Verify no plaintext secret key leaks onto record
      expect((record as unknown as Record<string, unknown>)['secretValue']).toBeUndefined();
    });

    it('retrieves masked records without ciphertext or plaintext secrets for UI dashboard', async () => {
      const list = await getMaskedGatewayCredentials({
        tenantId,
        providerSlug: 'stripe_connect',
      });

      expect(Array.isArray(list)).toBe(true);
      for (const item of list) {
        expect(item.last4).toBeDefined();
        expect((item as unknown as Record<string, unknown>)['encryptedPayload']).toBeUndefined();
        expect((item as unknown as Record<string, unknown>)['secretValue']).toBeUndefined();
      }
    });
  });
});
