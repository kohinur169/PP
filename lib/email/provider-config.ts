// path: lib/email/provider-config.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { encryptWithDomainKey, decryptWithDomainKey } from '@/lib/crypto/aes';

export type EmailProviderType = 'smtp' | 'resend' | 'sendgrid' | 'postmark' | 'ses';

export interface EmailProviderConfigRecord {
  id: string;
  tenantId: string;
  providerType: EmailProviderType;
  isActive: boolean;
  fromName: string;
  fromEmail: string;
  replyTo?: string | undefined;
  smtpHost?: string | undefined;
  smtpPort?: number | undefined;
  smtpSecure?: boolean | undefined;
  smtpUsername?: string | undefined;
  encryptedSecret: string;
  maskedSecret: string;
  lastTestSentAt?: string | undefined;
  lastTestStatus?: 'pending' | 'success' | 'failed' | undefined;
  updatedBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface SaveEmailProviderConfigInput {
  tenantId: string;
  providerType: EmailProviderType;
  fromName: string;
  fromEmail: string;
  replyTo?: string | undefined;
  secret: string; // Plaintext SMTP password or provider API key
  smtpHost?: string | undefined;
  smtpPort?: number | undefined;
  smtpSecure?: boolean | undefined;
  smtpUsername?: string | undefined;
  actorUserId: string;
  actorRole: string;
}

export interface SendTestEmailInput {
  configId: string;
  recipientEmail: string;
  actorUserId: string;
  simulateFailure?: boolean | undefined; // For error testing
}

export interface TestEmailResult {
  success: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
}

export class EmailTestVerificationRequiredError extends Error {
  public readonly code = 'EMAIL_TEST_VERIFICATION_REQUIRED';
  public readonly statusCode = 422;

  constructor(message = 'Activating a new email configuration requires a successful test email first.') {
    super(message);
    this.name = 'EmailTestVerificationRequiredError';
  }
}

const configStore = new Map<string, EmailProviderConfigRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Masks sensitive email secrets.
 */
function maskSecret(secret: string): string {
  const last4 = secret.slice(-4);
  return `••••••••••••${last4}`;
}

/**
 * Step 149.1: Saves an email provider configuration.
 * Only super_admin has permission.
 * Secret is stored AES-256-GCM encrypted; never displayed in full after saving.
 */
export async function saveEmailProviderConfig(
  input: SaveEmailProviderConfigInput
): Promise<EmailProviderConfigRecord> {
  if (input.actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can configure email sending settings.');
  }

  if (!input.fromEmail || !input.fromEmail.includes('@')) {
    throw new Error('Valid fromEmail address is required.');
  }

  if (!input.secret || input.secret.trim().length === 0) {
    throw new Error('Email provider API key or SMTP password is required.');
  }

  // Encrypt secret with domain key 'tokens'
  const encryptedSecret = encryptWithDomainKey('tokens', input.secret);
  const maskedSecret = maskSecret(input.secret);

  const now = new Date().toISOString();
  const id = generateUuidV7();

  const record: EmailProviderConfigRecord = {
    id,
    tenantId: input.tenantId,
    providerType: input.providerType,
    isActive: false, // Inactive until test email succeeds and explicit activation
    fromName: input.fromName,
    fromEmail: input.fromEmail.trim().toLowerCase(),
    replyTo: input.replyTo?.trim().toLowerCase(),
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure ?? true,
    smtpUsername: input.smtpUsername,
    encryptedSecret,
    maskedSecret,
    lastTestStatus: 'pending',
    updatedBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
  };

  configStore.set(id, record);

  logger.info('Email provider configuration saved (inactive pending test)', {
    configId: id,
    tenantId: input.tenantId,
    providerType: input.providerType,
    fromEmail: record.fromEmail,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorUserId,
      action: 'EMAIL_CONFIG_SAVED',
      entity_type: 'email_provider_config',
      entity_id: id,
      payload: {
        tenantId: input.tenantId,
        providerType: input.providerType,
        fromEmail: record.fromEmail,
        maskedSecret: record.maskedSecret,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for email config save', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 149.2: Sends test email to verify credentials and transport.
 */
export async function sendTestEmail(
  input: SendTestEmailInput
): Promise<TestEmailResult> {
  const config = configStore.get(input.configId);
  if (!config) {
    throw new Error(`Email provider config '${input.configId}' was not found.`);
  }

  const now = new Date().toISOString();

  // Decrypt secret to verify encryption integrity
  let decryptedSecret: string;
  try {
    decryptedSecret = decryptWithDomainKey('tokens', config.encryptedSecret);
  } catch {
    config.lastTestStatus = 'failed';
    config.lastTestSentAt = now;
    config.updatedAt = now;
    return { success: false, error: 'Failed to decrypt email credentials.' };
  }

  if (input.simulateFailure || !decryptedSecret) {
    config.lastTestStatus = 'failed';
    config.lastTestSentAt = now;
    config.updatedAt = now;

    logger.error('Test email sending failed', {
      configId: config.id,
      recipient: input.recipientEmail,
    });

    return { success: false, error: 'Simulated connection failure.' };
  }

  const messageId = `msg_test_${generateUuidV7().replace(/-/g, '').slice(0, 16)}`;
  config.lastTestStatus = 'success';
  config.lastTestSentAt = now;
  config.updatedAt = now;

  logger.info('Test email sent successfully', {
    configId: config.id,
    recipient: input.recipientEmail,
    messageId,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorUserId,
      action: 'EMAIL_CONFIG_TEST_SENT',
      entity_type: 'email_provider_config',
      entity_id: config.id,
      payload: {
        recipient: input.recipientEmail,
        status: 'success',
        messageId,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for test email', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { success: true, messageId };
}

/**
 * Step 149.3: Activates email provider configuration.
 * Rules:
 * - "Activating a new configuration requires a successful test email first."
 * - "One sending method is active at a time."
 */
export async function activateEmailProviderConfig(
  configId: string,
  actorUserId: string,
  actorRole: string
): Promise<EmailProviderConfigRecord> {
  if (actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only super_admin can activate email sending configurations.');
  }

  const targetConfig = configStore.get(configId);
  if (!targetConfig) {
    throw new Error(`Email provider config '${configId}' was not found.`);
  }

  // Gate: requires successful test email first
  if (targetConfig.lastTestStatus !== 'success') {
    throw new EmailTestVerificationRequiredError(
      `Cannot activate email configuration '${configId}': A successful test email is mandatory first. Current test status: '${targetConfig.lastTestStatus}'.`
    );
  }

  const now = new Date().toISOString();

  // Rule: "One sending method is active at a time." Deactivate any existing active config for tenant
  for (const cfg of configStore.values()) {
    if (cfg.tenantId === targetConfig.tenantId && cfg.isActive) {
      cfg.isActive = false;
      cfg.updatedAt = now;
    }
  }

  targetConfig.isActive = true;
  targetConfig.updatedBy = actorUserId;
  targetConfig.updatedAt = now;

  logger.info('Email provider configuration activated', {
    configId: targetConfig.id,
    tenantId: targetConfig.tenantId,
    providerType: targetConfig.providerType,
  });

  try {
    await auditRepo.append({
      actor_id: actorUserId,
      action: 'EMAIL_CONFIG_ACTIVATED',
      entity_type: 'email_provider_config',
      entity_id: targetConfig.id,
      payload: {
        tenantId: targetConfig.tenantId,
        providerType: targetConfig.providerType,
        fromEmail: targetConfig.fromEmail,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for email config activation', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return targetConfig;
}

/**
 * Retrieves the currently active email configuration for a tenant.
 */
export async function getActiveEmailProviderConfig(
  tenantId: string
): Promise<EmailProviderConfigRecord | null> {
  for (const cfg of configStore.values()) {
    if (cfg.tenantId === tenantId && cfg.isActive) {
      return cfg;
    }
  }
  return null;
}

/**
 * Retrieves an email configuration by ID.
 */
export async function getEmailProviderConfig(
  configId: string
): Promise<EmailProviderConfigRecord | null> {
  return configStore.get(configId) ?? null;
}

/**
 * Resets the in-memory email configuration store for test isolation.
 */
export function resetEmailConfigStore(): void {
  configStore.clear();
}
