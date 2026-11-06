// path: tests/processors/sync-status.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  syncProviderAccountCapabilities,
  assertChargesEnabled,
  assertPayoutsEnabled,
  getProviderVerificationRecord,
  resetSyncStatusCache,
  ProviderWebhookSecurityError,
  ProviderCapabilityRestrictionError,
  computeRawPayloadHash,
  type ProviderCapabilitySyncInput,
} from '@/lib/processors/sync-status';

describe('Provider Verification Status & Account Capability Synchronization (Step 124)', () => {
  const companyId = '33333333-3333-4333-8333-333333333333';
  const tenantId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    resetSyncStatusCache();
  });

  describe('Signature Verification Security Guard', () => {
    it('rejects webhooks with unverified signature', async () => {
      const unverifiedInput: ProviderCapabilitySyncInput = {
        tenantId,
        companyId,
        provider: 'stripe_connect',
        providerSubmerchantId: 'acct_stripe_test123',
        verificationStatus: 'verified',
        capabilities: { charges_enabled: true, payouts_enabled: true },
        providerTimestamp: new Date().toISOString(),
        rawPayload: { event: 'account.updated', id: 'evt_123' },
        signatureVerified: false, // Invalid signature
      };

      await expect(
        syncProviderAccountCapabilities(unverifiedInput)
      ).rejects.toThrow(ProviderWebhookSecurityError);
    });
  });

  describe('Charges Disabled Invariant Until Specific Provider Is Verified', () => {
    it('disables charges when verification status is pending even if payload claims charges_enabled is true', async () => {
      const pendingInput: ProviderCapabilitySyncInput = {
        tenantId,
        companyId,
        provider: 'rainforest',
        providerSubmerchantId: 'sub_rf_pending999',
        verificationStatus: 'pending',
        capabilities: { charges_enabled: true, payouts_enabled: false }, // Malformed or early payload
        providerTimestamp: new Date().toISOString(),
        rawPayload: { status: 'pending', charges_enabled: true },
        signatureVerified: true,
      };

      const result = await syncProviderAccountCapabilities(pendingInput);

      expect(result.record.verificationStatus).toBe('pending');
      expect(result.record.capabilities.charges_enabled).toBe(false);

      await expect(assertChargesEnabled(companyId, 'rainforest')).rejects.toThrow(
        ProviderCapabilityRestrictionError
      );
    });

    it('enables charges when specific provider reports verified status', async () => {
      const verifiedInput: ProviderCapabilitySyncInput = {
        tenantId,
        companyId,
        provider: 'rainforest',
        providerSubmerchantId: 'sub_rf_pending999',
        verificationStatus: 'verified',
        capabilities: { charges_enabled: true, payouts_enabled: true },
        providerTimestamp: new Date().toISOString(),
        rawPayload: { status: 'verified', charges_enabled: true, payouts_enabled: true },
        signatureVerified: true,
      };

      const result = await syncProviderAccountCapabilities(verifiedInput);

      expect(result.record.verificationStatus).toBe('verified');
      expect(result.record.capabilities.charges_enabled).toBe(true);
      expect(result.record.capabilities.payouts_enabled).toBe(true);

      const isAllowed = await assertChargesEnabled(companyId, 'rainforest');
      expect(isAllowed).toBe(true);
    });
  });

  describe('Strict Provider Isolation (One Provider Verification Never Satisfies Another)', () => {
    it('maintains independent verification status across different processors', async () => {
      // 1. Stripe is verified
      await syncProviderAccountCapabilities({
        tenantId,
        companyId,
        provider: 'stripe_connect',
        providerSubmerchantId: 'acct_stripe_verified',
        verificationStatus: 'verified',
        capabilities: { charges_enabled: true, payouts_enabled: true },
        providerTimestamp: new Date().toISOString(),
        rawPayload: { provider: 'stripe', status: 'verified' },
        signatureVerified: true,
      });

      // 2. Airwallex is still pending
      await syncProviderAccountCapabilities({
        tenantId,
        companyId,
        provider: 'airwallex',
        providerSubmerchantId: 'sub_awx_pending',
        verificationStatus: 'pending',
        capabilities: { charges_enabled: false, payouts_enabled: false },
        providerTimestamp: new Date().toISOString(),
        rawPayload: { provider: 'airwallex', status: 'pending' },
        signatureVerified: true,
      });

      // Stripe is verified and allows charges
      const stripeRecord = await getProviderVerificationRecord(companyId, 'stripe_connect');
      expect(stripeRecord?.verificationStatus).toBe('verified');
      expect(stripeRecord?.capabilities.charges_enabled).toBe(true);
      await expect(assertChargesEnabled(companyId, 'stripe_connect')).resolves.toBe(true);

      // Airwallex remains restricted / pending and MUST reject charges
      const airwallexRecord = await getProviderVerificationRecord(companyId, 'airwallex');
      expect(airwallexRecord?.verificationStatus).toBe('pending');
      expect(airwallexRecord?.capabilities.charges_enabled).toBe(false);
      await expect(assertChargesEnabled(companyId, 'airwallex')).rejects.toThrow(
        ProviderCapabilityRestrictionError
      );

      // NMI is not provisioned at all
      await expect(assertChargesEnabled(companyId, 'nmi')).rejects.toThrow(
        /has no provisioned account/
      );
    });
  });

  describe('Payout Restriction Handling', () => {
    it('blocks payouts immediately when webhook reports restricted status', async () => {
      // 1. Initially verified with payouts enabled
      await syncProviderAccountCapabilities({
        tenantId,
        companyId,
        provider: 'payoneer',
        providerSubmerchantId: 'pdr_payoneer_123',
        verificationStatus: 'verified',
        capabilities: { charges_enabled: true, payouts_enabled: true },
        providerTimestamp: new Date().toISOString(),
        rawPayload: { status: 'verified', payouts_enabled: true },
        signatureVerified: true,
      });

      await expect(assertPayoutsEnabled(companyId, 'payoneer')).resolves.toBe(true);

      // 2. Webhook restricts payouts due to risk flag
      const restrictionWebhook: ProviderCapabilitySyncInput = {
        tenantId,
        companyId,
        provider: 'payoneer',
        providerSubmerchantId: 'pdr_payoneer_123',
        verificationStatus: 'restricted',
        capabilities: { charges_enabled: false, payouts_enabled: false },
        providerTimestamp: new Date().toISOString(),
        rawPayload: { status: 'restricted', reason: 'DOCUMENTATION_REQUIRED', payouts_enabled: false },
        signatureVerified: true,
      };

      const result = await syncProviderAccountCapabilities(restrictionWebhook);
      expect(result.record.verificationStatus).toBe('restricted');
      expect(result.record.capabilities.payouts_enabled).toBe(false);

      // 3. System must fail closed and reject payouts
      await expect(assertPayoutsEnabled(companyId, 'payoneer')).rejects.toThrow(
        ProviderCapabilityRestrictionError
      );
    });
  });

  describe('Idempotency & Raw Payload Hashing', () => {
    it('detects idempotent webhook replay and returns cached record without reprocessing', async () => {
      const payloadObj = { event: 'account.updated', account: 'acct_123', timestamp: 1700000000 };
      const expectedHash = computeRawPayloadHash(payloadObj);

      const input: ProviderCapabilitySyncInput = {
        tenantId,
        companyId,
        provider: 'nmi',
        providerSubmerchantId: 'mid_nmi_777',
        verificationStatus: 'verified',
        capabilities: { charges_enabled: true, payouts_enabled: true },
        providerTimestamp: new Date().toISOString(),
        rawPayload: payloadObj,
        signatureVerified: true,
      };

      const firstCall = await syncProviderAccountCapabilities(input);
      expect(firstCall.idempotentReplay).toBe(false);
      expect(firstCall.record.rawPayloadHash).toBe(expectedHash);

      // Replay same payload
      const secondCall = await syncProviderAccountCapabilities(input);
      expect(secondCall.idempotentReplay).toBe(true);
      expect(secondCall.record.id).toBe(firstCall.record.id);
      expect(secondCall.statusChanged).toBe(false);
    });
  });
});
