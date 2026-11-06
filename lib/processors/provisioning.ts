// path: lib/processors/provisioning.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger';

export type PaymentProcessorProvider =
  | 'nmi'
  | 'stripe_connect'
  | 'rainforest'
  | 'airwallex'
  | 'payoneer';

export type SubMerchantStatus =
  | 'provisioning'
  | 'active'
  | 'restricted'
  | 'suspended'
  | 'pending_master_gateway';

export interface SubMerchantCapabilities {
  card_payments: boolean;
  transfers: boolean;
  payouts: boolean;
}

export interface SubMerchantAccountEntity {
  id: string;
  tenantId: string;
  companyId: string;
  providerName: PaymentProcessorProvider;
  providerSubmerchantId?: string | undefined;
  status: SubMerchantStatus;
  capabilities: SubMerchantCapabilities;
  webhookEndpointId?: string | undefined;
  lastSyncedAt?: string | undefined;
  errorMessage?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisioningSummary {
  companyId: string;
  tenantId: string;
  totalProvidersAttempted: number;
  activeAccountsCount: number;
  pendingMasterCount: number;
  accounts: SubMerchantAccountEntity[];
  requiresOfficeAlert: boolean;
  alertReason?: string | undefined;
}

export interface OperationalGateEvaluation {
  canAcceptPayments: boolean;
  canInitiatePayouts: boolean;
  canPublishOfferings: boolean;
  activeGatewayProviders: PaymentProcessorProvider[];
  reasons: string[];
}

export const ALL_PLATFORM_PROCESSORS: readonly PaymentProcessorProvider[] = [
  'nmi',
  'stripe_connect',
  'rainforest',
  'airwallex',
  'payoneer',
] as const;

/**
 * Generates an idempotent provider-specific sub-merchant identifier.
 */
export function generateProviderSubmerchantId(
  provider: PaymentProcessorProvider,
  companyId: string
): string {
  const shortId = companyId.replace(/-/g, '').slice(0, 12);
  switch (provider) {
    case 'stripe_connect':
      return `acct_stripe_${shortId}`;
    case 'rainforest':
      return `sub_rf_${shortId}`;
    case 'nmi':
      return `mid_nmi_${shortId}`;
    case 'airwallex':
      return `sub_awx_${shortId}`;
    case 'payoneer':
      return `pdr_payoneer_${shortId}`;
  }
}

/**
 * Provisions sub-merchant accounts across all platform payment processors.
 * Handles missing master platform gateway credentials gracefully by queuing with status
 * 'pending_master_gateway' and triggering office alerts (Step 110.3).
 */
export async function provisionSubMerchantAccounts(params: {
  tenantId: string;
  companyId: string;
  companyLegalName: string;
  mccCode: string;
  masterGatewayAvailability?: Record<PaymentProcessorProvider, boolean> | undefined;
  providers?: PaymentProcessorProvider[] | undefined;
}): Promise<ProvisioningSummary> {
  const targetProviders = params.providers ?? [...ALL_PLATFORM_PROCESSORS];
  const now = new Date().toISOString();
  const accounts: SubMerchantAccountEntity[] = [];

  const masterAvailability = params.masterGatewayAvailability ?? {
    nmi: true,
    stripe_connect: true,
    rainforest: true,
    airwallex: true,
    payoneer: true,
  };

  let pendingMasterCount = 0;
  let activeAccountsCount = 0;

  for (const provider of targetProviders) {
    const isMasterAvailable = masterAvailability[provider] ?? true;
    const accountId = generateUuidV7();

    if (!isMasterAvailable) {
      pendingMasterCount++;
      logger.warn('URGENT: Master platform gateway account disconnected; queuing sub-merchant provisioning', {
        companyId: params.companyId,
        provider,
      });

      accounts.push({
        id: accountId,
        tenantId: params.tenantId,
        companyId: params.companyId,
        providerName: provider,
        status: 'pending_master_gateway',
        capabilities: { card_payments: false, transfers: false, payouts: false },
        errorMessage: `Master platform gateway account for ${provider} is not connected. Urgent configuration required.`,
        metadata: { queuedAt: now, companyLegalName: params.companyLegalName },
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    // Master gateway connected: complete provisioning
    const providerSubmerchantId = generateProviderSubmerchantId(provider, params.companyId);
    const webhookEndpointId = `wh_sub_${accountId.slice(0, 8)}`;

    activeAccountsCount++;
    accounts.push({
      id: accountId,
      tenantId: params.tenantId,
      companyId: params.companyId,
      providerName: provider,
      providerSubmerchantId,
      status: 'active',
      capabilities: { card_payments: true, transfers: true, payouts: true },
      webhookEndpointId,
      lastSyncedAt: now,
      metadata: {
        mccCode: params.mccCode,
        companyLegalName: params.companyLegalName,
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  const requiresOfficeAlert = pendingMasterCount > 0;
  const alertReason = requiresOfficeAlert
    ? `Urgent: ${pendingMasterCount} gateway provider(s) require master platform configuration before sub-merchant activation.`
    : undefined;

  logger.info('Sub-merchant provisioning pipeline run completed', {
    companyId: params.companyId,
    totalAttempted: targetProviders.length,
    activeAccountsCount,
    pendingMasterCount,
  });

  return {
    companyId: params.companyId,
    tenantId: params.tenantId,
    totalProvidersAttempted: targetProviders.length,
    activeAccountsCount,
    pendingMasterCount,
    accounts,
    requiresOfficeAlert,
    alertReason,
  };
}

/**
 * Operational Gate Evaluation (Step 110.4):
 * Product listings, payments, and payouts are enabled strictly after
 * BOTH payment processor verification and platform risk checks pass.
 */
export function isMerchantOperational(params: {
  subMerchantAccounts: SubMerchantAccountEntity[];
  isProcessorVerified: boolean;
  isPlatformRiskCleared: boolean;
}): OperationalGateEvaluation {
  const reasons: string[] = [];
  const activeProviders = params.subMerchantAccounts
    .filter((acc) => acc.status === 'active')
    .map((acc) => acc.providerName);

  if (!params.isProcessorVerified) {
    reasons.push('Processor authoritative KYB verification is not complete.');
  }

  if (!params.isPlatformRiskCleared) {
    reasons.push('Platform compliance and risk underwriting checks are not cleared.');
  }

  if (activeProviders.length === 0) {
    reasons.push('Zero active sub-merchant processor accounts provisioned.');
  }

  const isFullyCleared =
    params.isProcessorVerified &&
    params.isPlatformRiskCleared &&
    activeProviders.length > 0;

  return {
    canAcceptPayments: isFullyCleared,
    canInitiatePayouts: isFullyCleared,
    canPublishOfferings: isFullyCleared,
    activeGatewayProviders: activeProviders,
    reasons,
  };
}
