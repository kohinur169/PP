// path: tests/email/activity-mailer.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveEmailTemplate,
  dispatchActivityEmail,
  retryFailedEmailSends,
  getEmailSendLog,
  resetActivityMailerStore,
  DEFAULT_TEMPLATES,
  ActivityEmailTemplateKey,
} from '@/lib/email/activity-mailer';
import {
  saveEmailProviderConfig,
  sendTestEmail,
  activateEmailProviderConfig,
  resetEmailConfigStore,
} from '@/lib/email/provider-config';

describe('Activity Email Lifecycle, Template Customization & Retry Engine (Step 150)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const superAdminId = '99999999-9999-4999-8999-999999999999';
  const merchantUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    resetActivityMailerStore();
    resetEmailConfigStore();
  });

  describe('Template Customization by super_admin (Step 150.1)', () => {
    it('verifies default built-in templates exist for all 18 platform activity triggers', () => {
      const keys: ActivityEmailTemplateKey[] = [
        'welcome_verification',
        'password_reset',
        'login_lock_alert',
        'new_device_alert',
        'kyc_submitted',
        'kyc_approved',
        'kyc_rejected',
        'invoice_sent',
        'payment_received',
        'payment_failed',
        'refund_update',
        'dispute_update',
        'payout_sent',
        'settlement_released',
        'subscription_warning',
        'service_stop_restore',
        'support_reply',
        'account_unlock_confirmation',
      ];

      for (const k of keys) {
        expect(DEFAULT_TEMPLATES[k]).toBeDefined();
        expect(DEFAULT_TEMPLATES[k].subject.length).toBeGreaterThan(0);
      }
    });

    it('allows super_admin to customize templates with template variables', async () => {
      const updated = await saveEmailTemplate({
        tenantId,
        templateKey: 'login_lock_alert',
        subject: 'URGENT: Your Merchant Account is Locked ({{hours}}h)',
        htmlBody: '<p>Hi {{merchantName}}, your account was locked for {{hours}} hours.</p>',
        textBody: 'Hi {{merchantName}}, your account was locked for {{hours}} hours.',
        updaterUserId: superAdminId,
        updaterRole: 'super_admin',
      });

      expect(updated.id).toBeDefined();
      expect(updated.templateKey).toBe('login_lock_alert');
      expect(updated.subject).toContain('{{hours}}h');
    });

    it('rejects template edits from non-super_admin actors', async () => {
      await expect(
        saveEmailTemplate({
          tenantId,
          templateKey: 'payout_sent',
          subject: 'Custom Payout Notice',
          htmlBody: '<p>Payout</p>',
          textBody: 'Payout',
          updaterUserId: merchantUserId,
          updaterRole: 'merchant_admin',
        })
      ).rejects.toThrow(/Only super_admin can edit email templates/);
    });
  });

  describe('Automated Send Logging & Variable Interpolation (Step 150.2)', () => {
    it('logs every dispatch with template, recipient, status and provider message id', async () => {
      // 1. Activate email provider
      const config = await saveEmailProviderConfig({
        tenantId,
        providerType: 'resend',
        fromName: 'KD Platform',
        fromEmail: 'noreply@kdsolution.example.com',
        secret: 're_secret_active_1234',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });
      await sendTestEmail({
        configId: config.id,
        recipientEmail: 'admin@example.com',
        actorUserId: superAdminId,
      });
      await activateEmailProviderConfig(config.id, superAdminId, 'super_admin');

      // 2. Dispatch dispute update
      const sendLog = await dispatchActivityEmail({
        tenantId,
        templateKey: 'dispute_update',
        recipient: 'merchant@store.com',
        variables: {
          disputeId: 'dsp_8892',
          deadlineAt: '2026-11-06T12:00:00Z',
        },
      });

      expect(sendLog.status).toBe('sent');
      expect(sendLog.recipient).toBe('merchant@store.com');
      expect(sendLog.subject).toContain('24h Deadline');
      expect(sendLog.providerMessageId).toBeDefined();
      expect(sendLog.providerMessageId).toMatch(/^msg_disp_/);
      expect(sendLog.sentAt).toBeDefined();
    });
  });

  describe('Background Retry Queue with Maximum Retry Limit (Step 150.3)', () => {
    it('retries failed email deliveries and respects the maximum retry limit', async () => {
      // 1. Dispatch email without active provider -> fails and queues
      const failedLog = await dispatchActivityEmail({
        tenantId,
        templateKey: 'welcome_verification',
        recipient: 'newuser@example.com',
        variables: {
          merchantName: 'Acme Corp',
          verifyUrl: 'https://payfac.kd.example.com/verify?token=xyz',
        },
      });

      expect(failedLog.status).toBe('failed');
      expect(failedLog.retryCount).toBe(0);

      // 2. Run background retry job before provider is active -> attempt fails, increments count
      const summary1 = await retryFailedEmailSends(tenantId);
      expect(summary1.inspectedCount).toBe(1);
      expect(summary1.retriedCount).toBe(1);
      expect(summary1.succeededCount).toBe(0);

      const refreshed1 = await getEmailSendLog(failedLog.id);
      expect(refreshed1?.retryCount).toBe(1);
      expect(refreshed1?.status).toBe('failed');

      // 3. Now activate email provider
      const config = await saveEmailProviderConfig({
        tenantId,
        providerType: 'sendgrid',
        fromName: 'KD Platform',
        fromEmail: 'noreply@kdsolution.example.com',
        secret: 'SG.sec_ready_token_5678',
        actorUserId: superAdminId,
        actorRole: 'super_admin',
      });
      await sendTestEmail({
        configId: config.id,
        recipientEmail: 'admin@example.com',
        actorUserId: superAdminId,
      });
      await activateEmailProviderConfig(config.id, superAdminId, 'super_admin');

      // 4. Run background retry job -> succeeds
      const summary2 = await retryFailedEmailSends(tenantId);
      expect(summary2.inspectedCount).toBe(1);
      expect(summary2.retriedCount).toBe(1);
      expect(summary2.succeededCount).toBe(1);

      const refreshed2 = await getEmailSendLog(failedLog.id);
      expect(refreshed2?.status).toBe('sent');
      expect(refreshed2?.providerMessageId).toMatch(/^msg_retry_/);
      expect(refreshed2?.sentAt).toBeDefined();
    });

    it('marks send as permanently exhausted when exceeding max retries', async () => {
      const failedLog = await dispatchActivityEmail({
        tenantId,
        templateKey: 'payment_failed',
        recipient: 'buyer@example.com',
        variables: { orderId: 'ord_123', amount: 50, failureReason: 'Insufficient funds' },
      });

      // Exhaust 3 retries without activating provider
      await retryFailedEmailSends(tenantId); // retry 1
      await retryFailedEmailSends(tenantId); // retry 2
      await retryFailedEmailSends(tenantId); // retry 3

      const exhaustedLog = await getEmailSendLog(failedLog.id);
      expect(exhaustedLog?.retryCount).toBe(3);

      // 4th retry cycle: must be exhausted and not retried further
      const summary = await retryFailedEmailSends(tenantId);
      expect(summary.inspectedCount).toBe(1);
      expect(summary.retriedCount).toBe(0);
      expect(summary.exhaustedCount).toBe(1);
    });
  });
});
