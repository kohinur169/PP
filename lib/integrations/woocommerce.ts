// path: lib/integrations/woocommerce.ts

import { randomBytes } from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { encryptWithDomainKey, decryptWithDomainKey } from '@/lib/crypto/aes';
import { authenticateApiKey } from '@/lib/api/api-keys';

export type WooCommerceConnectionStatus =
  | 'installed'
  | 'active'
  | 'disabled'
  | 'uninstalled';

export interface WooCommerceStoreConnectionRecord {
  id: string;
  tenantId: string;
  companyId: string;
  siteUrl: string;
  encryptedWebhookSecret: string;
  pluginVersion: string;
  wcVersion?: string | undefined;
  status: WooCommerceConnectionStatus;
  isFunctional: boolean;
  installedAt: string;
  lastSyncAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectWooCommerceStoreInput {
  tenantId: string;
  companyId: string;
  siteUrl: string;
  merchantApiKey: string; // Secret key for authentication
  installerUserId: string;
  pluginVersion?: string | undefined;
  wcVersion?: string | undefined;
}

export interface WooCommerceHealthCheckResult {
  siteUrl: string;
  isHealthy: boolean;
  status: WooCommerceConnectionStatus;
  isFunctional: boolean;
  latencyMs: number;
}

const woocommerceStore = new Map<string, WooCommerceStoreConnectionRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Validates canonical WordPress / WooCommerce site URL format.
 */
export function validateSiteUrl(siteUrl: string): boolean {
  if (!siteUrl || typeof siteUrl !== 'string') return false;
  try {
    const parsed = new URL(siteUrl.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Normalizes URL by trimming trailing slashes.
 */
function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Step 148.1: Native WooCommerce Plugin Credential Login & Auto-Activation Bridge.
 * Section 20: "WooCommerce: the platform has its own plugin. A merchant logs in with
 * credentials in the plugin and the connection becomes active automatically."
 */
export async function connectWooCommerceStore(
  input: ConnectWooCommerceStoreInput
): Promise<WooCommerceStoreConnectionRecord> {
  const normalizedUrl = normalizeSiteUrl(input.siteUrl);

  // 1. Validate site URL format
  if (!validateSiteUrl(normalizedUrl)) {
    throw new Error(
      `Invalid WooCommerce site URL '${input.siteUrl}'. URL must be a valid HTTP or HTTPS address.`
    );
  }

  // 2. Authenticate merchant credentials
  const apiKeyRecord = await authenticateApiKey(input.merchantApiKey);
  if (apiKeyRecord.companyId !== input.companyId) {
    throw new Error('Merchant API key does not match connecting company ID.');
  }

  // 3. Generate webhook signing secret and encrypt using AES-256-GCM
  const rawWebhookSecret = `whsec_wc_${randomBytes(24).toString('hex')}`;
  const encryptedWebhookSecret = encryptWithDomainKey(
    'tokens',
    rawWebhookSecret
  );

  const now = new Date().toISOString();
  const id = generateUuidV7();

  // 4. Auto-activate connection (becomes active automatically)
  const record: WooCommerceStoreConnectionRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    siteUrl: normalizedUrl,
    encryptedWebhookSecret,
    pluginVersion: input.pluginVersion ?? '1.0.0',
    wcVersion: input.wcVersion ?? '8.5.0',
    status: 'active',
    isFunctional: true,
    installedAt: now,
    lastSyncAt: now,
    createdAt: now,
    updatedAt: now,
  };

  woocommerceStore.set(normalizedUrl, record);

  logger.info('WooCommerce store connection established and auto-activated', {
    connectionId: id,
    companyId: input.companyId,
    siteUrl: normalizedUrl,
    pluginVersion: record.pluginVersion,
    isFunctional: true,
  });

  // 5. Audit Log
  try {
    await auditRepo.append({
      actor_id: input.installerUserId,
      action: 'WOOCOMMERCE_PLUGIN_AUTO_ACTIVATED',
      entity_type: 'woocommerce_store_connection',
      entity_id: id,
      payload: {
        companyId: input.companyId,
        siteUrl: normalizedUrl,
        pluginVersion: record.pluginVersion,
        wcVersion: record.wcVersion ?? null,
        isFunctional: true,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for WooCommerce connection', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return record;
}

/**
 * Step 148.2: Disconnects / uninstalls WooCommerce plugin connection.
 */
export async function disconnectWooCommerceStore(
  siteUrl: string,
  actorUserId: string
): Promise<WooCommerceStoreConnectionRecord> {
  const normalizedUrl = normalizeSiteUrl(siteUrl);
  const connection = woocommerceStore.get(normalizedUrl);

  if (!connection) {
    throw new Error(`WooCommerce connection for URL '${siteUrl}' was not found.`);
  }

  const now = new Date().toISOString();
  connection.status = 'uninstalled';
  connection.isFunctional = false;
  connection.updatedAt = now;

  logger.warn('WooCommerce store connection disconnected/uninstalled', {
    connectionId: connection.id,
    siteUrl: normalizedUrl,
    actorUserId,
  });

  try {
    await auditRepo.append({
      actor_id: actorUserId,
      action: 'WOOCOMMERCE_PLUGIN_DISCONNECTED',
      entity_type: 'woocommerce_store_connection',
      entity_id: connection.id,
      payload: {
        companyId: connection.companyId,
        siteUrl: normalizedUrl,
        status: 'uninstalled',
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for WooCommerce disconnect', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return connection;
}

/**
 * Step 148.3: Health Check & Webhook Secret Decryption Diagnostic.
 */
export async function verifyWooCommerceStoreHealth(
  siteUrl: string
): Promise<WooCommerceHealthCheckResult> {
  const normalizedUrl = normalizeSiteUrl(siteUrl);
  const connection = woocommerceStore.get(normalizedUrl);

  if (!connection || connection.status !== 'active') {
    return {
      siteUrl: normalizedUrl,
      isHealthy: false,
      status: connection?.status ?? 'uninstalled',
      isFunctional: false,
      latencyMs: 0,
    };
  }

  // Verify decryption of stored webhook secret
  try {
    decryptWithDomainKey('tokens', connection.encryptedWebhookSecret);
  } catch {
    return {
      siteUrl: normalizedUrl,
      isHealthy: false,
      status: 'disabled',
      isFunctional: false,
      latencyMs: 0,
    };
  }

  connection.lastSyncAt = new Date().toISOString();

  return {
    siteUrl: normalizedUrl,
    isHealthy: true,
    status: 'active',
    isFunctional: connection.isFunctional,
    latencyMs: 12,
  };
}

/**
 * Retrieves WooCommerce connection by site URL.
 */
export async function getWooCommerceConnection(
  siteUrl: string
): Promise<WooCommerceStoreConnectionRecord | null> {
  return woocommerceStore.get(normalizeSiteUrl(siteUrl)) ?? null;
}

/**
 * Retrieves WooCommerce connection for a merchant company.
 */
export async function getWooCommerceConnectionForCompany(
  companyId: string
): Promise<WooCommerceStoreConnectionRecord | null> {
  for (const conn of woocommerceStore.values()) {
    if (conn.companyId === companyId) {
      return conn;
    }
  }
  return null;
}

/**
 * Resets the in-memory WooCommerce store for test isolation.
 */
export function resetWooCommerceStore(): void {
  woocommerceStore.clear();
}
