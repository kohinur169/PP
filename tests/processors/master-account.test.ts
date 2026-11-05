// path: tests/processors/master-account.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  verifyMasterAccountConfigured,
  queueSubMerchantProvisioning,
  retryQueuedProvisioningJobs,
  getDispatchedMissingKeyAlerts,
  clearMissingKeyAlerts,
  getQueuedProvisioningJobs,
  clearQueuedProvisioningJobs,
} from '@/lib/processors/master-account';
import { saveGatewayCredential } from '@/lib/processors/credentials';

describe('Master Platform Account Connection Queue & Missing-Key Alerting (Step 125)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '44444444-4444-4444-8444-444444444444';
  const companyLegalName = 'Apex Global Logistics LLC';

  beforeEach(() => {
    clearMissingKeyAlerts();
    clearQueuedProvisioningJobs();
  });

  describe('Master Gateway Account Verification', () => {
    it('reports missing credentials when master gateway has not been configured', async () => {
      const result = await verifyMasterAccountConfigured(tenantId, 'airwallex');

      expect(result.isConfigured).toBe(false);
      expect(result.status).toBe('missing_credentials');
      expect(result.missingKey).toContain('Master platform airwallex api_key is not configured');
    });

    it('reports configured when master gateway credentials exist and decrypt cleanly', async () => {
      await saveGatewayCredential({
        tenantId,
        providerSlug: 'airwallex',
        credentialType: 'api_key',
        secretValue: 'sec_test_mock_airwallex_key_441290384',
        environment: 'sandbox',
      });

      const result = await verifyMasterAccountConfigured(tenantId, 'airwallex');

      expect(result.isConfigured).toBe(true);
      expect(result.status).toBe('configured');
    });
  });

  describe('Provisioning Queue Guard & Missing-Key Alerting', () => {
    it('pauses sub-merchant provisioning in queued_missing_master_credentials state when master key is missing', async () => {
      // Rainforest is not configured
      const job = await queueSubMerchantProvisioning({
        tenantId,
        companyId,
        companyLegalName,
        providerSlug: 'rainforest',
      });

      expect(job.status).toBe('queued_missing_master_credentials');
      expect(job.errorMessage).toContain('rainforest');
      expect(job.companyLegalName).toBe(companyLegalName);

      const queuedJobs = getQueuedProvisioningJobs('rainforest');
      expect(queuedJobs.length).toBe(1);
      expect(queuedJobs[0]?.id).toBe(job.id);
    });

    it('dispatches urgent notifications to Super Admin and CEO when provisioning is queued', async () => {
      await queueSubMerchantProvisioning({
        tenantId,
        companyId,
        companyLegalName,
        providerSlug: 'payoneer',
      });

      const alerts = getDispatchedMissingKeyAlerts();
      expect(alerts.length).toBe(1);

      const alert = alerts[0]!;
      expect(alert.providerSlug).toBe('payoneer');
      expect(alert.recipientRoles).toContain('SUPER_ADMIN');
      expect(alert.recipientRoles).toContain('CEO');
      expect(alert.subject).toContain('URGENT ACTION REQUIRED: Configure Master Gateway Credentials for PAYONEER');
      expect(alert.actionUrl).toBe('/super-admin/gateways');
      expect(alert.companyLegalName).toBe(companyLegalName);
    });

    it('activates provisioning immediately when master platform gateway credentials are already configured', async () => {
      await saveGatewayCredential({
        tenantId,
        providerSlug: 'nmi',
        credentialType: 'security_key',
        secretValue: 'sec_test_mock_nmi_key_992182049182',
        environment: 'sandbox',
      });

      const job = await queueSubMerchantProvisioning({
        tenantId,
        companyId,
        companyLegalName,
        providerSlug: 'nmi',
      });

      expect(job.status).toBe('active');
      expect(job.errorMessage).toBeUndefined();
      expect(job.completedAt).toBeDefined();

      const alerts = getDispatchedMissingKeyAlerts();
      expect(alerts.length).toBe(0);
    });
  });

  describe('Queued Provisioning Retry Lifecycle', () => {
    it('refuses to retry queued jobs if master credentials are still missing', async () => {
      await queueSubMerchantProvisioning({
        tenantId,
        companyId,
        companyLegalName,
        providerSlug: 'stripe_connect',
      });

      await expect(
        retryQueuedProvisioningJobs(tenantId, 'stripe_connect')
      ).rejects.toThrow(/Master gateway credentials are still missing/);
    });

    it('successfully retries and activates all queued provisioning jobs once master gateway credentials are configured', async () => {
      // 1. Multiple merchant provisioning jobs queued due to missing Stripe key
      const job1 = await queueSubMerchantProvisioning({
        tenantId,
        companyId: 'company_aaa',
        companyLegalName: 'Alpha Store LLC',
        providerSlug: 'stripe_connect',
      });

      const job2 = await queueSubMerchantProvisioning({
        tenantId,
        companyId: 'company_bbb',
        companyLegalName: 'Beta Commerce Inc',
        providerSlug: 'stripe_connect',
      });

      expect(job1.status).toBe('queued_missing_master_credentials');
      expect(job2.status).toBe('queued_missing_master_credentials');

      // 2. Super Admin configures Stripe master credentials
      await saveGatewayCredential({
        tenantId,
        providerSlug: 'stripe_connect',
        credentialType: 'api_secret_key',
        secretValue: 'sec_test_mock_stripe_key_771920384102',
        environment: 'sandbox',
      });

      // 3. Retry queued provisioning jobs
      const retryResult = await retryQueuedProvisioningJobs(tenantId, 'stripe_connect');

      expect(retryResult.totalQueuedFound).toBe(2);
      expect(retryResult.successfullyRetriedCount).toBe(2);

      const allJobs = getQueuedProvisioningJobs('stripe_connect');
      expect(allJobs.every((j) => j.status === 'active')).toBe(true);
      expect(allJobs.every((j) => j.retryCount === 1)).toBe(true);
      expect(allJobs.every((j) => j.completedAt !== undefined)).toBe(true);
    });
  });
});
