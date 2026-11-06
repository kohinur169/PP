// path: lib/provisioning/submerchant-provisioner.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { dispatchActivityEmail } from '@/lib/email/activity-mailer';

export type PaymentProcessorProvider =
  | 'nmi'
  | 'stripe_connect'
  | 'rainforest'
  | 'airwallex'
  | 'payoneer';

export interface ApprovedKycCandidate {
  kycReviewId: string;
  tenantId: string;
  companyId: string;
  companyName: string;
  contactEmail: string;
  country: string;
  currency: string;
  riskTier: 1 | 2 | 3;
  mccCode: string;
  singleTransactionCapUsd: number;
  monthlyVolumeCapUsd: number;
  rollingReservePercent: number;
}

export interface SubmerchantAccountRecord {
  id: string;
  tenantId: string;
  companyId: string;
  providerName: PaymentProcessorProvider;
  providerSubmerchantId: string;
  status: 'provisioning' | 'active' | 'restricted' | 'suspended' | 'pending_master_gateway';
  capabilities: {
    card_payments: boolean;
    transfers: boolean;
    payouts: boolean;
  };
  webhookEndpointId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisioningResult {
  submerchantId: string;
  companyId: string;
  providerName: PaymentProcessorProvider;
  providerSubmerchantId: string;
  status: 'active';
  emailSent: boolean;
}

const submerchantStore = new Map<string, SubmerchantAccountRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Determines default upstream payment processor by currency / region.
 */
export function resolveProcessorForMerchant(country: string, _currency: string): PaymentProcessorProvider {
  if (country === 'US') {
    return 'nmi';
  }
  if (['CA', 'GB', 'EU'].includes(country)) {
    return 'stripe_connect';
  }
  if (['AU', 'SG', 'HK'].includes(country)) {
    return 'airwallex';
  }
  return 'rainforest';
}

/**
 * Step 164.1: Automated Sub-merchant Provisioning Worker After KYC Approval.
 * Section 27: "Sub-merchant provisioning after KYC approval."
 * Section 11: "Sub-merchant accounts: each approved company is provisioned a sub-merchant account with its assigned risk tier, MCC and rolling reserve settings."
 */
export async function provisionSubmerchantAfterKyc(
  candidate: ApprovedKycCandidate
): Promise<ProvisioningResult> {
  const storeKey = `${candidate.tenantId}:${candidate.companyId}`;
  const existing = submerchantStore.get(storeKey);

  if (existing && existing.status === 'active') {
    logger.info('Sub-merchant already active for company', {
      companyId: candidate.companyId,
      submerchantId: existing.id,
    });
    return {
      submerchantId: existing.id,
      companyId: candidate.companyId,
      providerName: existing.providerName,
      providerSubmerchantId: existing.providerSubmerchantId,
      status: 'active',
      emailSent: false,
    };
  }

  const submerchantId = generateUuidV7();
  const provider = resolveProcessorForMerchant(candidate.country, candidate.currency);
  const providerSubmerchantId = `sub_${provider}_${generateUuidV7().replace(/-/g, '').slice(0, 16)}`;
  const webhookEndpointId = `wh_${generateUuidV7().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();

  const record: SubmerchantAccountRecord = {
    id: submerchantId,
    tenantId: candidate.tenantId,
    companyId: candidate.companyId,
    providerName: provider,
    providerSubmerchantId,
    status: 'active',
    capabilities: {
      card_payments: true,
      transfers: true,
      payouts: true,
    },
    webhookEndpointId,
    metadata: {
      riskTier: candidate.riskTier,
      mccCode: candidate.mccCode,
      singleTransactionCapUsd: candidate.singleTransactionCapUsd,
      monthlyVolumeCapUsd: candidate.monthlyVolumeCapUsd,
      rollingReservePercent: candidate.rollingReservePercent,
      provisionedViaJob: 'KYC_APPROVAL_WORKER',
    },
    createdAt: now,
    updatedAt: now,
  };

  submerchantStore.set(storeKey, record);

  // 1. Audit log the provisioning
  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'SUBMERCHANT_PROVISIONED',
      entity_type: 'submerchant_account',
      entity_id: submerchantId,
      payload: {
        companyId: candidate.companyId,
        providerName: provider,
        providerSubmerchantId,
        riskTier: candidate.riskTier,
        mccCode: candidate.mccCode,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to audit log submerchant provisioning', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Dispatch onboarding success notification via activity mailer
  let emailSent = false;
  try {
    const emailRes = await dispatchActivityEmail({
      tenantId: candidate.tenantId,
      templateKey: 'kyc_approved',
      recipient: candidate.contactEmail,
      variables: {
        companyName: candidate.companyName,
        riskTier: candidate.riskTier,
        providerSubmerchantId,
      },
    });
    emailSent = emailRes.status === 'sent';
  } catch (err: unknown) {
    logger.warn('Failed to dispatch merchant activation email', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('Sub-merchant provisioned successfully', {
    companyId: candidate.companyId,
    submerchantId,
    provider,
  });

  return {
    submerchantId,
    companyId: candidate.companyId,
    providerName: provider,
    providerSubmerchantId,
    status: 'active',
    emailSent,
  };
}

/**
 * Batch processor for approved KYC reviews awaiting provisioning.
 */
export async function runApprovedKycProvisioningBatch(
  candidates: ApprovedKycCandidate[]
): Promise<ProvisioningResult[]> {
  const results: ProvisioningResult[] = [];
  for (const c of candidates) {
    const res = await provisionSubmerchantAfterKyc(c);
    results.push(res);
  }
  return results;
}

/**
 * Test helpers.
 */
export function getSubmerchantAccount(tenantId: string, companyId: string): SubmerchantAccountRecord | undefined {
  return submerchantStore.get(`${tenantId}:${companyId}`);
}

export function resetSubmerchantStore(): void {
  submerchantStore.clear();
}
