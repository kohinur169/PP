// path: tests/email/provider-config.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveEmailProviderConfig,
  sendTestEmail,
  activateEmailProviderConfig,
  getActiveEmailProviderConfig,
  getEmailProviderConfig,
  resetEmailConfigStore,
  EmailTestVerificationRequiredError,
} from '@/lib/email/provider-config';

describe('Multi-Provider Email System & Live Test Verification Gate (Step 149)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const superAdminId = '99999999-9999-4999-8999-999999999999';
  const supportUserId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    resetEmailConfigStore();
  });

  describe('Configuration Save & Encryption (Step 149.1)', () => {
    it('saves email provider config with encrypted secret and masked display', async () => {
      const config = await saveEmailProviderConfig({
        tenantId,
        providerType: 'resend',
        fromName: 'KD Solution PayFac',
        fromEmail: 'noreply@kdsolution.example.com',
        secret: 're_live_mock_api_key_secret_8888',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      expect(config.id).toBeDefined();
      expect(config.isActive).toBe(false); // Inactive pending test
      expect(config.lastTestStatus).toBe('pending');
      expect(config.maskedSecret).toBe('••••••••••••8888');

      // Plaintext secret is never stored on the record
      expect((config as unknown as Record<string, unknown>).secret).toBeUndefined();
      expect(config.encryptedSecret).not.toContain('re_live_mock_api_key_secret_8888');
    });

    it('rejects configuration changes from non-super_admin roles', async () => {
      await expect(
        saveEmailProviderConfig({
          tenantId,
          providerType: 'smtp',
          fromName: 'Support Desk',
          fromEmail: 'support@example.com',
          secret: 'smtp_password_123',
          actorUserId: supportUserId,
          actorRole: 'support',
        })
      ).rejects.toThrow(/Only super_admin can configure email sending settings/);
    });
  });

  describe('Live Test Verification Gate (Step 149.2)', () => {
    it('strictly forbids activating a configuration before sending a successful test email', async () => {
      const config = await saveEmailProviderConfig({
        tenantId,
        providerType: 'smtp',
        fromName: 'Billing Service',
        fromEmail: 'billing@example.com',
        smtpHost: 'smtp.sendgrid.net',
        smtpPort: 587,
        secret: 'SG.mock_smtp_secret_token_1234',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      // Attempting to activate before test email must fail
      await expect(
        activateEmailProviderConfig(config.id, superAdminId, 'super_admin')
      ).rejects.toThrow(EmailTestVerificationRequiredError);

      await expect(
        activateEmailProviderConfig(config.id, superAdminId, 'super_admin')
      ).rejects.toThrow(/A successful test email is mandatory first/);
    });

    it('blocks activation if test email fails', async () => {
      const config = await saveEmailProviderConfig({
        tenantId,
        providerType: 'sendgrid',
        fromName: 'Billing Service',
        fromEmail: 'billing@example.com',
        secret: 'SG.mock_smtp_secret_token_1234',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      // Simulate test email failure
      const testResult = await sendTestEmail({
        configId: config.id,
        recipientEmail: 'admin@example.com',
        actorUserId: superAdminId,
        simulateFailure: true,
      });

      expect(testResult.success).toBe(false);

      const refreshed = await getEmailProviderConfig(config.id);
      expect(refreshed?.lastTestStatus).toBe('failed');

      // Activation must still fail
      await expect(
        activateEmailProviderConfig(config.id, superAdminId, 'super_admin')
      ).rejects.toThrow(EmailTestVerificationRequiredError);
    });

    it('permits activation once test email succeeds and deactivates prior configurations', async () => {
      // 1. Create and activate Provider A (Resend)
      const configA = await saveEmailProviderConfig({
        tenantId,
        providerType: 'resend',
        fromName: 'Provider A',
        fromEmail: 'resend@example.com',
        secret: 're_secret_1111',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });
      await sendTestEmail({
        configId: configA.id,
        recipientEmail: 'test@example.com',
        actorUserId: superAdminId,
      });
      const activatedA = await activateEmailProviderConfig(configA.id, superAdminId, 'super_admin');
      expect(activatedA.isActive).toBe(true);

      // 2. Create Provider B (Postmark)
      const configB = await saveEmailProviderConfig({
        tenantId,
        providerType: 'postmark',
        fromName: 'Provider B',
        fromEmail: 'postmark@example.com',
        secret: 'pm_secret_2222',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });

      // Run test email for Provider B
      const testB = await sendTestEmail({
        configId: configB.id,
        recipientEmail: 'test@example.com',
        actorUserId: superAdminId,
      });
      expect(testB.success).toBe(true);

      // Activate Provider B
      const activatedB = await activateEmailProviderConfig(configB.id, superAdminId, 'super_admin');
      expect(activatedB.isActive).toBe(true);

      // Invariant: One sending method active at a time -> Provider A must now be inactive
      const checkA = await getEmailProviderConfig(configA.id);
      expect(checkA?.isActive).toBe(false);

      const active = await getActiveEmailProviderConfig(tenantId);
      expect(active?.id).toBe(configB.id);
      expect(active?.providerType).toBe('postmark');
    });
  });
});
