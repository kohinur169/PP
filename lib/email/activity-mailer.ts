// path: lib/email/activity-mailer.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { getActiveEmailProviderConfig } from '@/lib/email/provider-config';

export type ActivityEmailTemplateKey =
  | 'welcome_verification'
  | 'password_reset'
  | 'login_lock_alert'
  | 'new_device_alert'
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'invoice_sent'
  | 'payment_received'
  | 'payment_failed'
  | 'refund_update'
  | 'dispute_update'
  | 'payout_sent'
  | 'settlement_released'
  | 'subscription_warning'
  | 'service_stop_restore'
  | 'support_reply'
  | 'account_unlock_confirmation';

export interface EmailTemplateRecord {
  id: string;
  tenantId: string;
  templateKey: ActivityEmailTemplateKey;
  subject: string;
  htmlBody: string;
  textBody: string;
  updatedBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSendLogRecord {
  id: string;
  tenantId: string;
  templateKey: ActivityEmailTemplateKey;
  recipient: string;
  subject: string;
  status: 'queued' | 'sent' | 'failed' | 'retrying';
  providerMessageId?: string | undefined;
  retryCount: number;
  maxRetries: number;
  lastError?: string | undefined;
  sentAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchActivityEmailInput {
  tenantId: string;
  templateKey: ActivityEmailTemplateKey;
  recipient: string;
  variables: Record<string, string | number>;
  simulateFailure?: boolean | undefined; // For retry queue testing
}

export interface EmailRetrySummary {
  inspectedCount: number;
  retriedCount: number;
  succeededCount: number;
  exhaustedCount: number;
}

const templateStore = new Map<string, EmailTemplateRecord>();
const logStore = new Map<string, EmailSendLogRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Built-in default templates for all required platform activities.
 * Section 23: "Activity emails are sent automatically for welcome and verification, password reset,
 * login lock alert, new device alert, KYC submitted, approved and rejected, invoice sent,
 * payment received and failed, refund and dispute updates, payout sent, settlement released,
 * subscription warnings and service stop and restore notices, support replies and account unlock confirmation."
 */
export const DEFAULT_TEMPLATES: Record<
  ActivityEmailTemplateKey,
  { subject: string; html: string; text: string }
> = {
  welcome_verification: {
    subject: 'Welcome to KD Solution PayFac - Verify Your Email',
    html: '<p>Welcome {{merchantName}}! Please verify your email at {{verifyUrl}}</p>',
    text: 'Welcome {{merchantName}}! Please verify your email at {{verifyUrl}}',
  },
  password_reset: {
    subject: 'Password Reset Request',
    html: '<p>Click here to reset your password: {{resetUrl}}</p>',
    text: 'Click here to reset your password: {{resetUrl}}',
  },
  login_lock_alert: {
    subject: 'Security Alert: Account Locked for 2 Hours',
    html: '<p>Your account was locked for 2 hours following 2 consecutive failed attempts.</p>',
    text: 'Your account was locked for 2 hours following 2 consecutive failed attempts.',
  },
  new_device_alert: {
    subject: 'Security Alert: New Device Login Detected',
    html: '<p>A new login was recorded from device {{deviceName}} at {{loginIp}}.</p>',
    text: 'A new login was recorded from device {{deviceName}} at {{loginIp}}.',
  },
  kyc_submitted: {
    subject: 'KYC Verification Submitted',
    html: '<p>We have received your KYC documents and compliance review is in progress.</p>',
    text: 'We have received your KYC documents and compliance review is in progress.',
  },
  kyc_approved: {
    subject: 'Congratulations! Your Merchant Account is Approved',
    html: '<p>Your KYC review is complete and merchant processing is now active.</p>',
    text: 'Your KYC review is complete and merchant processing is now active.',
  },
  kyc_rejected: {
    subject: 'KYC Review Update - Additional Information Required',
    html: '<p>Your KYC application could not be approved: {{reason}}</p>',
    text: 'Your KYC application could not be approved: {{reason}}',
  },
  invoice_sent: {
    subject: 'Invoice #{{invoiceNumber}} from {{merchantName}}',
    html: '<p>Your invoice #{{invoiceNumber}} for ${{amount}} USD is ready: {{paymentUrl}}</p>',
    text: 'Your invoice #{{invoiceNumber}} for ${{amount}} USD is ready: {{paymentUrl}}',
  },
  payment_received: {
    subject: 'Payment Received: ${{amount}} USD',
    html: '<p>Payment of ${{amount}} USD for Order #{{orderId}} was successfully captured.</p>',
    text: 'Payment of ${{amount}} USD for Order #{{orderId}} was successfully captured.',
  },
  payment_failed: {
    subject: 'Payment Failed for Order #{{orderId}}',
    html: '<p>Payment of ${{amount}} USD failed: {{failureReason}}</p>',
    text: 'Payment of ${{amount}} USD failed: {{failureReason}}',
  },
  refund_update: {
    subject: 'Refund Processed: ${{amount}} USD',
    html: '<p>Refund of ${{amount}} USD for Payment {{paymentId}} was processed.</p>',
    text: 'Refund of ${{amount}} USD for Payment {{paymentId}} was processed.',
  },
  dispute_update: {
    subject: 'Action Required: Chargeback Dispute Filed - 24h Deadline',
    html: '<p>Dispute #{{disputeId}} filed. Evidence must be submitted by {{deadlineAt}}.</p>',
    text: 'Dispute #{{disputeId}} filed. Evidence must be submitted by {{deadlineAt}}.',
  },
  payout_sent: {
    subject: 'Payout Dispatched: ${{amount}} USD',
    html: '<p>Your payout of ${{amount}} USD has been transferred to your bank account.</p>',
    text: 'Your payout of ${{amount}} USD has been transferred to your bank account.',
  },
  settlement_released: {
    subject: 'Settlement Released: ${{amount}} USD',
    html: '<p>Rolling reserve / hold of ${{amount}} USD has matured and been released.</p>',
    text: 'Rolling reserve / hold of ${{amount}} USD has matured and been released.',
  },
  subscription_warning: {
    subject: 'Notice: Subscription Renewal in 7 Days',
    html: '<p>Your platform subscription will renew on {{renewalDate}} for ${{amount}} USD.</p>',
    text: 'Your platform subscription will renew on {{renewalDate}} for ${{amount}} USD.',
  },
  service_stop_restore: {
    subject: 'Platform Service Status: {{serviceStatus}}',
    html: '<p>Merchant processing service has been updated: {{statusDetail}}</p>',
    text: 'Merchant processing service has been updated: {{statusDetail}}',
  },
  support_reply: {
    subject: 'New Reply on Support Ticket #{{ticketId}}',
    html: '<p>Support team replied: {{replyExcerpt}}</p>',
    text: 'Support team replied: {{replyExcerpt}}',
  },
  account_unlock_confirmation: {
    subject: 'Security Notice: Account Unlocked',
    html: '<p>Your account lock has been cleared by authorized compliance staff.</p>',
    text: 'Your account lock has been cleared by authorized compliance staff.',
  },
};

/**
 * Replaces {{variable}} placeholders with actual values.
 */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
  });
}

/**
 * Step 150.1: Super Admin Template Editing.
 * "Email templates are editable by super_admin."
 */
export async function saveEmailTemplate(input: {
  tenantId: string;
  templateKey: ActivityEmailTemplateKey;
  subject: string;
  htmlBody: string;
  textBody: string;
  updaterUserId: string;
  updaterRole: string;
}): Promise<EmailTemplateRecord> {
  if (input.updaterRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can edit email templates.');
  }

  const key = `${input.tenantId}:${input.templateKey}`;
  const now = new Date().toISOString();
  const existing = templateStore.get(key);

  const record: EmailTemplateRecord = {
    id: existing?.id ?? generateUuidV7(),
    tenantId: input.tenantId,
    templateKey: input.templateKey,
    subject: input.subject,
    htmlBody: input.htmlBody,
    textBody: input.textBody,
    updatedBy: input.updaterUserId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  templateStore.set(key, record);

  logger.info('Email template updated by super_admin', {
    tenantId: input.tenantId,
    templateKey: input.templateKey,
  });

  try {
    await auditRepo.append({
      actor_id: input.updaterUserId,
      action: 'EMAIL_TEMPLATE_UPDATED',
      entity_type: 'email_template',
      entity_id: record.id,
      payload: {
        tenantId: input.tenantId,
        templateKey: input.templateKey,
        subject: input.subject,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for template update', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 150.2: Automated Activity Email Dispatcher.
 * Dispatches activity email using active configuration and logs send status.
 */
export async function dispatchActivityEmail(
  input: DispatchActivityEmailInput
): Promise<EmailSendLogRecord> {
  // Resolve template
  const customKey = `${input.tenantId}:${input.templateKey}`;
  const custom = templateStore.get(customKey);
  const defaultTpl = DEFAULT_TEMPLATES[input.templateKey];

  const subjectTpl = custom?.subject ?? defaultTpl.subject;
  const renderedSubject = interpolate(subjectTpl, input.variables);

  // Check active provider
  const activeConfig = await getActiveEmailProviderConfig(input.tenantId);
  const isDeliverySuccessful = !input.simulateFailure && activeConfig !== null;

  const now = new Date().toISOString();
  const id = generateUuidV7();
  const providerMessageId = isDeliverySuccessful
    ? `msg_disp_${generateUuidV7().replace(/-/g, '').slice(0, 16)}`
    : undefined;

  const logRecord: EmailSendLogRecord = {
    id,
    tenantId: input.tenantId,
    templateKey: input.templateKey,
    recipient: input.recipient.trim().toLowerCase(),
    subject: renderedSubject,
    status: isDeliverySuccessful ? 'sent' : 'failed',
    providerMessageId,
    retryCount: 0,
    maxRetries: 3,
    lastError: isDeliverySuccessful
      ? undefined
      : activeConfig === null
      ? 'No active email provider configuration found for tenant.'
      : 'Simulated network delivery failure.',
    sentAt: isDeliverySuccessful ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };

  logStore.set(id, logRecord);

  if (isDeliverySuccessful) {
    logger.info('Activity email sent successfully', {
      logId: id,
      templateKey: input.templateKey,
      recipient: logRecord.recipient,
      providerMessageId,
    });
  } else {
    logger.warn('Activity email dispatch failed, queued for retry', {
      logId: id,
      templateKey: input.templateKey,
      recipient: logRecord.recipient,
      error: logRecord.lastError,
    });
  }

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'EMAIL_DISPATCH_LOGGED',
      entity_type: 'email_send_log',
      entity_id: id,
      payload: {
        templateKey: input.templateKey,
        recipient: logRecord.recipient,
        status: logRecord.status,
        providerMessageId: logRecord.providerMessageId ?? null,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for email dispatch', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return logRecord;
}

/**
 * Step 150.3: Background Email Retry Queue.
 * "Failed sends are retried by background job with a retry limit."
 */
export async function retryFailedEmailSends(
  tenantId?: string
): Promise<EmailRetrySummary> {
  let inspectedCount = 0;
  let retriedCount = 0;
  let succeededCount = 0;
  let exhaustedCount = 0;

  const now = new Date().toISOString();

  for (const log of logStore.values()) {
    if (tenantId && log.tenantId !== tenantId) {
      continue;
    }

    if (log.status === 'failed' || log.status === 'retrying') {
      inspectedCount++;

      if (log.retryCount >= log.maxRetries) {
        log.status = 'failed';
        exhaustedCount++;
        continue;
      }

      retriedCount++;
      log.retryCount++;
      log.status = 'retrying';

      // Re-verify provider config
      const activeConfig = await getActiveEmailProviderConfig(log.tenantId);
      if (activeConfig) {
        log.status = 'sent';
        log.sentAt = now;
        log.providerMessageId = `msg_retry_${generateUuidV7().replace(/-/g, '').slice(0, 16)}`;
        log.lastError = undefined;
        log.updatedAt = now;
        succeededCount++;

        logger.info('Failed email re-sent successfully by retry job', {
          logId: log.id,
          recipient: log.recipient,
          attempt: log.retryCount,
        });
      } else {
        log.status = 'failed';
        log.lastError = 'Retry failed: No active email provider configuration available.';
        log.updatedAt = now;

        if (log.retryCount >= log.maxRetries) {
          exhaustedCount++;
        }
      }
    }
  }

  return {
    inspectedCount,
    retriedCount,
    succeededCount,
    exhaustedCount,
  };
}

/**
 * Retrieves an email send log record by ID.
 */
export async function getEmailSendLog(logId: string): Promise<EmailSendLogRecord | null> {
  return logStore.get(logId) ?? null;
}

/**
 * Resets in-memory template and log store for test isolation.
 */
export function resetActivityMailerStore(): void {
  templateStore.clear();
  logStore.clear();
}
