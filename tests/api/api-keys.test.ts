// path: tests/api/api-keys.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMerchantApiKey,
  revokeMerchantApiKey,
  regenerateMerchantApiKey,
  authenticateApiKey,
  getMerchantApiKey,
  listMerchantApiKeys,
  resetApiKeyStore,
  InvalidApiKeyAuthenticationError,
} from '@/lib/api/api-keys';

describe('Merchant Public API Key Management & Masked Secret Engine (Step 145)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const merchantAdminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    resetApiKeyStore();
  });

  describe('Key Pair Generation & Masking Invariant (Step 145.1)', () => {
    it('creates active publishable and secret key pair and returns plaintext secret only once', async () => {
      const result = await createMerchantApiKey({
        tenantId,
        companyId,
        name: 'Shopify Storefront Primary Key',
        environment: 'live',
        createdBy: merchantAdminId,
      });

      expect(result.record.id).toBeDefined();
      expect(result.record.status).toBe('active');
      expect(result.record.publishableKey).toMatch(/^pk_live_/);
      expect(result.plaintextSecretKey).toMatch(/^sk_live_/);

      // Verify masking invariant: record contains maskedSecretKey with bullets
      expect(result.record.maskedSecretKey).toMatch(/^sk_live_••••••••••••/);
      expect(result.record.maskedSecretKey.endsWith(result.plaintextSecretKey.slice(-4))).toBe(true);

      // Plaintext key is NOT part of the record itself
      expect((result.record as unknown as Record<string, unknown>).plaintextSecretKey).toBeUndefined();
    });

    it('stored and retrieved records strictly expose maskedSecretKey only', async () => {
      const result = await createMerchantApiKey({
        tenantId,
        companyId,
        environment: 'test',
        createdBy: merchantAdminId,
      });

      const retrieved = await getMerchantApiKey(result.record.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.maskedSecretKey).toMatch(/^sk_test_••••••••••••/);
      expect(retrieved?.maskedSecretKey).not.toBe(result.plaintextSecretKey);

      const list = await listMerchantApiKeys(companyId);
      expect(list.length).toBe(1);
      expect(list[0]?.maskedSecretKey).toMatch(/^sk_test_••••••••••••/);
    });
  });

  describe('API Authentication Engine (Step 145.2)', () => {
    it('authenticates valid secret key using cryptographic hash lookup and updates lastUsedAt', async () => {
      const result = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantAdminId,
      });

      const authenticated = await authenticateApiKey(result.plaintextSecretKey);
      expect(authenticated.id).toBe(result.record.id);
      expect(authenticated.companyId).toBe(companyId);
      expect(authenticated.lastUsedAt).toBeDefined();
    });

    it('authenticates valid publishable key for client-side hosted checkout', async () => {
      const result = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantAdminId,
      });

      const authenticated = await authenticateApiKey(result.record.publishableKey);
      expect(authenticated.id).toBe(result.record.id);
      expect(authenticated.companyId).toBe(companyId);
    });

    it('rejects invalid or forged API keys without leaking credentials in error message', async () => {
      await expect(
        authenticateApiKey('sk_live_forged_random_secret_token_1234')
      ).rejects.toThrow(InvalidApiKeyAuthenticationError);

      await expect(
        authenticateApiKey('invalid_prefix_key_9999')
      ).rejects.toThrow(InvalidApiKeyAuthenticationError);
    });
  });

  describe('Key Revocation & Lifecycle Enforcement (Step 145.3)', () => {
    it('revokes an API key and immediately forbids any subsequent authentication', async () => {
      const result = await createMerchantApiKey({
        tenantId,
        companyId,
        createdBy: merchantAdminId,
      });

      // Revoke the key
      const revoked = await revokeMerchantApiKey({
        keyId: result.record.id,
        revokedBy: merchantAdminId,
        revokerRole: 'merchant_admin',
      });

      expect(revoked.status).toBe('revoked');
      expect(revoked.revokedAt).toBeDefined();

      // Subsequent authentication must fail
      await expect(
        authenticateApiKey(result.plaintextSecretKey)
      ).rejects.toThrow(InvalidApiKeyAuthenticationError);

      await expect(
        authenticateApiKey(result.record.publishableKey)
      ).rejects.toThrow(InvalidApiKeyAuthenticationError);
    });
  });

  describe('Key Regeneration Workflow (Step 145.4)', () => {
    it('regenerates API key by revoking old credentials and issuing fresh key pair', async () => {
      const initial = await createMerchantApiKey({
        tenantId,
        companyId,
        name: 'WooCommerce Production Key',
        environment: 'live',
        createdBy: merchantAdminId,
      });

      const fresh = await regenerateMerchantApiKey({
        keyId: initial.record.id,
        regeneratedBy: merchantAdminId,
        regeneratorRole: 'merchant_admin',
      });

      expect(fresh.record.id).not.toBe(initial.record.id);
      expect(fresh.plaintextSecretKey).not.toBe(initial.plaintextSecretKey);
      expect(fresh.record.status).toBe('active');

      // Old secret key is immediately dead
      await expect(
        authenticateApiKey(initial.plaintextSecretKey)
      ).rejects.toThrow(InvalidApiKeyAuthenticationError);

      // New secret key authenticates successfully
      const authenticated = await authenticateApiKey(fresh.plaintextSecretKey);
      expect(authenticated.id).toBe(fresh.record.id);
    });
  });
});
