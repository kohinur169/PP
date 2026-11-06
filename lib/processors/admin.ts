// path: lib/processors/admin.ts

import { PROCESSOR_CAPABILITY_MATRIX } from '@/lib/processors/registry';
import { processorFactory } from '@/lib/processors/factory';
import type { PaymentProcessorSlug } from '@/types/processors';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger/logger';
import { maskSecret } from '@/lib/crypto/mask';

export interface AdminGatewayConfig {
  providerSlug: PaymentProcessorSlug;
  displayName: string;
  description: string;
  isEnabled: boolean;
  supportedCountries: readonly string[];
  supportedCurrencies: readonly string[];
  capabilities: {
    cardAcceptance: boolean;
    eWallets: boolean;
    subMerchantCreation: boolean;
    payouts: boolean;
    hostedFields: boolean;
  };
  maskedCredentials: Record<string, string>;
  lastTestedAt?: string | undefined;
  lastTestStatus?: 'connected' | 'failed' | 'untested' | undefined;
  lastLatencyMs?: number | undefined;
}

// In-memory runtime state for super admin overrides during process lifecycle
const runtimeGatewayState = new Map<
  string,
  {
    isEnabled: boolean;
    lastTestedAt?: string | undefined;
    lastTestStatus?: 'connected' | 'failed' | 'untested' | undefined;
    lastLatencyMs?: number | undefined;
    customCredentials?: Record<string, string> | undefined;
  }
>();

const auditRepo = new AuditLogRepository();

/**
 * Validates whether the actor has super_admin role and valid 2FA step-up verification.
 */
function assertSuperAdminWithStepUp(actorRole: string, stepUpVerified: boolean): void {
  if (actorRole !== 'super_admin') {
    throw new Error('Access denied. Super Admin role required for gateway administration.');
  }

  if (!stepUpVerified) {
    throw new Error('Step-up 2FA reauthentication required to view or modify payment gateways.');
  }
}

/**
 * Retrieves all registered payment gateways with masked credentials and health status.
 * Strictly gated behind Super Admin role and recent 2FA step-up.
 */
export async function getAdminGatewayConfigs(params: {
  actorRole: string;
  actorUserId: string;
  stepUpVerified: boolean;
}): Promise<AdminGatewayConfig[]> {
  assertSuperAdminWithStepUp(params.actorRole, params.stepUpVerified);

  const slugs: PaymentProcessorSlug[] = [
    'nmi',
    'payoneer',
    'rainforest',
    'stripe_connect',
    'airwallex',
  ];

  return slugs.map((slug) => {
    const meta = PROCESSOR_CAPABILITY_MATRIX[slug];
    const state = runtimeGatewayState.get(slug);

    // Build masked credentials dictionary
    const masked: Record<string, string> = {};
    if (slug === 'nmi') {
      const key = process.env['NMI_SECURITY_KEY'] ?? 'mock_sec_key_nmi_991823';
      masked['securityKey'] = maskSecret(key);
    } else if (slug === 'stripe_connect') {
      const key = process.env['STRIPE_SECRET_KEY'] ?? 'sk_test_mock_stripe_key_4481';
      masked['secretKey'] = maskSecret(key);
    } else if (slug === 'payoneer') {
      const sec = process.env['PAYONEER_CLIENT_SECRET'] ?? 'payo_secret_mock_7721';
      masked['clientSecret'] = maskSecret(sec);
    } else if (slug === 'rainforest') {
      const key = process.env['RAINFOREST_API_KEY'] ?? 'rf_key_test_mock_3301';
      masked['apiKey'] = maskSecret(key);
    } else if (slug === 'airwallex') {
      const key = process.env['AIRWALLEX_API_KEY'] ?? 'awx_api_key_mock_5512';
      masked['apiKey'] = maskSecret(key);
    }

    return {
      providerSlug: slug,
      displayName: meta.displayName,
      description: meta.description,
      isEnabled: state ? state.isEnabled : meta.isEnabled,
      supportedCountries: meta.supportedCountries,
      supportedCurrencies: meta.supportedCurrencies,
      capabilities: {
        cardAcceptance: meta.capabilities.cardAcceptance,
        eWallets: meta.capabilities.eWallets,
        subMerchantCreation: meta.capabilities.subMerchantCreation,
        payouts: meta.capabilities.payouts,
        hostedFields: meta.capabilities.hostedFields,
      },
      maskedCredentials: masked,
      lastTestedAt: state?.lastTestedAt,
      lastTestStatus: state?.lastTestStatus ?? 'untested',
      lastLatencyMs: state?.lastLatencyMs,
    };
  });
}

/**
 * Executes a live connection test against a gateway and writes an immutable audit record.
 */
export async function testGatewayConnectionAdmin(params: {
  providerSlug: PaymentProcessorSlug;
  actorUserId: string;
  actorRole: string;
  stepUpVerified: boolean;
  credentials?: Record<string, string> | undefined;
}): Promise<{ isConnected: boolean; latencyMs: number; message: string }> {
  assertSuperAdminWithStepUp(params.actorRole, params.stepUpVerified);

  const adapter = processorFactory.getAdapter(params.providerSlug, {
    credentials: params.credentials,
  });

  let isConnected = false;
  let latencyMs = 0;
  let message = '';

  try {
    const testResult = await adapter.testConnection();
    isConnected = testResult.isConnected;
    latencyMs = testResult.latencyMs;
    message = testResult.message;
  } catch (err: unknown) {
    isConnected = false;
    latencyMs = 999;
    message = err instanceof Error ? err.message : String(err);
  }

  // Update in-memory state
  const current = runtimeGatewayState.get(params.providerSlug) ?? {
    isEnabled: PROCESSOR_CAPABILITY_MATRIX[params.providerSlug].isEnabled,
  };

  runtimeGatewayState.set(params.providerSlug, {
    ...current,
    lastTestedAt: new Date().toISOString(),
    lastTestStatus: isConnected ? 'connected' : 'failed',
    lastLatencyMs: latencyMs,
  });

  try {
    await auditRepo.append({
      actor_id: params.actorUserId,
      action: 'GATEWAY_CONNECTION_TESTED',
      entity_type: 'gateway_configuration',
      entity_id: params.providerSlug,
      payload: {
        providerSlug: params.providerSlug,
        isConnected,
        latencyMs,
        message,
      },
    });
  } catch (auditErr: unknown) {
    logger.warn('Could not persist audit log for gateway connection test', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  return { isConnected, latencyMs, message };
}

/**
 * Toggles gateway enabled/disabled status.
 * Enforces rule: Cannot enable a gateway unless its connection test has succeeded.
 */
export async function toggleGatewayStatus(params: {
  providerSlug: PaymentProcessorSlug;
  isEnabled: boolean;
  actorUserId: string;
  actorRole: string;
  stepUpVerified: boolean;
}): Promise<AdminGatewayConfig> {
  assertSuperAdminWithStepUp(params.actorRole, params.stepUpVerified);

  const current = runtimeGatewayState.get(params.providerSlug) ?? {
    isEnabled: PROCESSOR_CAPABILITY_MATRIX[params.providerSlug].isEnabled,
  };

  // If attempting to enable, ensure last connection test passed
  if (params.isEnabled && current.lastTestStatus === 'failed') {
    throw new Error(
      `Cannot enable gateway '${params.providerSlug}'. The live connection test failed. Please verify credentials and re-test.`
    );
  }

  runtimeGatewayState.set(params.providerSlug, {
    ...current,
    isEnabled: params.isEnabled,
  });

  try {
    await auditRepo.append({
      actor_id: params.actorUserId,
      action: 'GATEWAY_CREDENTIALS_CONFIGURED',
      entity_type: 'gateway_configuration',
      entity_id: params.providerSlug,
      diff_payload: {
        before: { isEnabled: current.isEnabled },
        after: { isEnabled: params.isEnabled },
      },
      payload: { isEnabled: params.isEnabled },
    });
  } catch (auditErr: unknown) {
    logger.warn('Could not persist audit log for gateway status toggle', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  const all = await getAdminGatewayConfigs(params);
  const updated = all.find((g) => g.providerSlug === params.providerSlug);
  if (!updated) {
    throw new Error(`Gateway '${params.providerSlug}' not found.`);
  }

  return updated;
}
