// path: lib/cms/pricing.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export interface PricingVersionRecord {
  id: string;
  tenantId: string;
  versionNumber: string;
  platformFeePercent: number;      // e.g. 0.029 (2.9%)
  platformFeeFixedUsd: string;     // e.g. "0.3000"
  chargebackFeeUsd: string;        // e.g. "15.0000"
  refundFeeUsd: string;            // e.g. "0.0000"
  payoutAchFeeUsd: string;         // e.g. "0.2500"
  payoutWireFeeUsd: string;        // e.g. "15.0000"
  isActive: boolean;
  superAdminApprovedBy?: string | undefined;
  ceoApprovedBy?: string | undefined;
  effectiveDate: string;           // ISO timestamp
  announcementDate: string;        // ISO timestamp
  notes?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ProposePricingVersionInput {
  tenantId: string;
  versionNumber: string;
  platformFeePercent: number;
  platformFeeFixedUsd: string;
  chargebackFeeUsd: string;
  refundFeeUsd?: string | undefined;
  payoutAchFeeUsd?: string | undefined;
  payoutWireFeeUsd?: string | undefined;
  effectiveDate: string;
  proposedBy: string;
  notes?: string | undefined;
}

export interface PricingNoticeEvaluation {
  activeVersion: PricingVersionRecord;
  pendingVersion?: PricingVersionRecord | undefined;
  isAdvanceNoticeActive: boolean;
  noticeBannerMessage?: string | undefined;
  daysUntilEffective?: number | undefined;
}

const pricingStore = new Map<string, PricingVersionRecord>();
const auditRepo = new AuditLogRepository();

export const DEFAULT_ACTIVE_PRICING: PricingVersionRecord = {
  id: '018f6c4c-3500-7fa1-b1e2-000000000099',
  tenantId: 'default',
  versionNumber: 'v1.0.0',
  platformFeePercent: 0.029,
  platformFeeFixedUsd: '0.3000',
  chargebackFeeUsd: '15.0000',
  refundFeeUsd: '0.0000',
  payoutAchFeeUsd: '0.2500',
  payoutWireFeeUsd: '15.0000',
  isActive: true,
  superAdminApprovedBy: '00000000-0000-4000-8000-000000000001',
  ceoApprovedBy: '00000000-0000-4000-8000-000000000002',
  effectiveDate: '2026-01-01T00:00:00Z',
  announcementDate: '2025-12-01T00:00:00Z',
  notes: 'Foundational baseline fee structure',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

pricingStore.set('v1.0.0', DEFAULT_ACTIVE_PRICING);

/**
 * Step 235.1 & 235.4: Proposes pricing revision requiring dual Super Admin + CEO approval.
 * Enforces mandatory 30-day advance notice rule.
 */
export async function proposePricingVersion(input: ProposePricingVersionInput): Promise<PricingVersionRecord> {
  const now = new Date();
  const effective = new Date(input.effectiveDate);
  const diffDays = (effective.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 29.5) {
    throw new Error('Mandatory 30-day advance notice rule: Pricing changes must be scheduled at least 30 days in advance.');
  }

  const id = generateUuidV7();
  const nowIso = now.toISOString();

  const record: PricingVersionRecord = {
    id,
    tenantId: input.tenantId,
    versionNumber: input.versionNumber,
    platformFeePercent: input.platformFeePercent,
    platformFeeFixedUsd: Number(input.platformFeeFixedUsd).toFixed(4),
    chargebackFeeUsd: Number(input.chargebackFeeUsd).toFixed(4),
    refundFeeUsd: input.refundFeeUsd ? Number(input.refundFeeUsd).toFixed(4) : '0.0000',
    payoutAchFeeUsd: input.payoutAchFeeUsd ? Number(input.payoutAchFeeUsd).toFixed(4) : '0.2500',
    payoutWireFeeUsd: input.payoutWireFeeUsd ? Number(input.payoutWireFeeUsd).toFixed(4) : '15.0000',
    isActive: false, // Inactive pending dual approval and effective date arrival
    effectiveDate: input.effectiveDate,
    announcementDate: nowIso,
    notes: input.notes,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  pricingStore.set(input.versionNumber, record);

  logger.warn('New pricing version proposed with 30-day notice requirement', {
    versionNumber: input.versionNumber,
    effectiveDate: input.effectiveDate,
    daysNotice: Math.round(diffDays),
  });

  return record;
}

/**
 * Step 235.4: Sign-off mechanism requiring joint sign-off from Super Admin and CEO.
 */
export async function signOffPricingVersion(params: {
  versionNumber: string;
  signerId: string;
  signerRole: 'super_admin' | 'ceo';
}): Promise<PricingVersionRecord> {
  const record = pricingStore.get(params.versionNumber);
  if (!record) {
    throw new Error(`Pricing version '${params.versionNumber}' not found.`);
  }

  if (params.signerRole === 'super_admin') {
    record.superAdminApprovedBy = params.signerId;
  } else if (params.signerRole === 'ceo') {
    record.ceoApprovedBy = params.signerId;
  }

  record.updatedAt = new Date().toISOString();

  const isDualApproved = Boolean(record.superAdminApprovedBy && record.ceoApprovedBy);

  logger.info('Pricing revision signed off', {
    version: params.versionNumber,
    signerRole: params.signerRole,
    isDualApproved,
  });

  try {
    await auditRepo.append({
      actor_id: params.signerId,
      action: 'PRICING_VERSION_SIGNED_OFF',
      entity_type: 'pricing_version',
      entity_id: record.id,
      payload: {
        versionNumber: params.versionNumber,
        signerRole: params.signerRole,
        isDualApproved,
      },
    });
  } catch {}

  return record;
}

/**
 * Step 235.2 & 235.3: Evaluates pricing versions for public display and renders 30-day notice banner.
 */
export function evaluatePublicPricing(currentTime = new Date()): PricingNoticeEvaluation {
  let activeVersion = DEFAULT_ACTIVE_PRICING;
  let pendingVersion: PricingVersionRecord | undefined;

  for (const v of pricingStore.values()) {
    if (v.isActive) {
      activeVersion = v;
    } else if (v.superAdminApprovedBy && v.ceoApprovedBy) {
      const effTime = new Date(v.effectiveDate).getTime();
      if (effTime > currentTime.getTime()) {
        pendingVersion = v;
      }
    }
  }

  let isAdvanceNoticeActive = false;
  let noticeBannerMessage: string | undefined;
  let daysUntilEffective: number | undefined;

  if (pendingVersion) {
    const diffMs = new Date(pendingVersion.effectiveDate).getTime() - currentTime.getTime();
    daysUntilEffective = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    isAdvanceNoticeActive = true;
    noticeBannerMessage = `Notice: Pricing updates scheduled for version ${pendingVersion.versionNumber} will take effect on ${new Date(pendingVersion.effectiveDate).toLocaleDateString()} (${daysUntilEffective} days remaining).`;
  }

  return {
    activeVersion,
    pendingVersion,
    isAdvanceNoticeActive,
    noticeBannerMessage,
    daysUntilEffective,
  };
}

export function resetPricingStore(): void {
  pricingStore.clear();
  pricingStore.set('v1.0.0', DEFAULT_ACTIVE_PRICING);
}
