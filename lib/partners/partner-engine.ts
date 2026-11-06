// path: lib/partners/partner-engine.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import crypto from 'crypto';

export type PartnerType = 'referral' | 'iso' | 'integration';
export type PartnerStatus = 'pending_review' | 'active' | 'suspended' | 'terminated';
export type TaxFormType = 'w9' | 'w8ben' | 'w8ben_e';
export type TaxFormStatus = 'pending' | 'verified' | 'rejected';

export interface RegisterPartnerInput {
  tenantId: string;
  partnerName: string;
  partnerType: PartnerType;
  customReferralCode?: string | undefined;
  agreementVersion: string;
}

export interface PartnerRecord {
  id: string;
  tenantId: string;
  partnerName: string;
  partnerType: PartnerType;
  status: PartnerStatus;
  referralCode: string;
  agreementAcceptedAt: string;
  agreementVersion: string;
  taxFormType?: TaxFormType | undefined;
  taxFormStatus: TaxFormStatus;
  taxFormFileId?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralAttributionRecord {
  id: string;
  tenantId: string;
  partnerId: string;
  referredCompanyId?: string | undefined;
  attributionToken: string;
  visitorIpHash: string;
  landingUrl: string;
  status: 'clicked' | 'registered' | 'converted' | 'expired';
  expiresAt: string;
  createdAt: string;
}

const partnersStore = new Map<string, PartnerRecord>();
const attributionsStore = new Map<string, ReferralAttributionRecord>();
const auditRepo = new AuditLogRepository();

export const ATTRIBUTION_WINDOW_DAYS = 30;

/**
 * Step 181.1: Registers a new partner with agreement acceptance.
 * Section 31: "Partner onboarding: referral partners, ISOs (Independent Sales Organizations)... Unique referral link generation"
 */
export async function registerPartner(input: RegisterPartnerInput): Promise<PartnerRecord> {
  const partnerId = generateUuidV7();
  const now = new Date().toISOString();

  const codeBase = input.customReferralCode
    ? input.customReferralCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    : `REF-${input.partnerName.slice(0, 4).toUpperCase()}-${generateUuidV7().slice(-6).toUpperCase()}`;

  const record: PartnerRecord = {
    id: partnerId,
    tenantId: input.tenantId,
    partnerName: input.partnerName,
    partnerType: input.partnerType,
    status: 'pending_review',
    referralCode: codeBase,
    agreementAcceptedAt: now,
    agreementVersion: input.agreementVersion,
    taxFormStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  partnersStore.set(partnerId, record);

  logger.info('Partner registered, awaiting tax form compliance verification', {
    partnerId,
    partnerName: input.partnerName,
    partnerType: input.partnerType,
    referralCode: codeBase,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'PARTNER_REGISTERED',
      entity_type: 'partner',
      entity_id: partnerId,
      payload: {
        partnerName: input.partnerName,
        partnerType: input.partnerType,
        referralCode: codeBase,
      },
    });
  } catch {}

  return record;
}

/**
 * Step 181.2: Submits and verifies W-9 / W-8BEN tax documents.
 * Invariant: Partner commission payouts remain locked until tax status is 'verified'.
 */
export async function submitAndVerifyPartnerTaxForm(input: {
  partnerId: string;
  taxFormType: TaxFormType;
  taxFormFileId: string;
  complianceDecision: 'verified' | 'rejected';
  reviewerUserId: string;
}): Promise<PartnerRecord> {
  const partner = partnersStore.get(input.partnerId);
  if (!partner) {
    throw new Error(`Partner '${input.partnerId}' not found.`);
  }

  const now = new Date().toISOString();
  partner.taxFormType = input.taxFormType;
  partner.taxFormFileId = input.taxFormFileId;
  partner.taxFormStatus = input.complianceDecision;
  partner.updatedAt = now;

  if (input.complianceDecision === 'verified') {
    partner.status = 'active'; // Activates partner for payouts
    logger.info('Partner tax form verified, account status activated', {
      partnerId: partner.id,
      taxFormType: input.taxFormType,
    });
  } else {
    logger.warn('Partner tax form rejected by compliance', {
      partnerId: partner.id,
      taxFormType: input.taxFormType,
    });
  }

  try {
    await auditRepo.append({
      actor_id: input.reviewerUserId,
      action: 'PARTNER_TAX_FORM_VERIFIED',
      entity_type: 'partner',
      entity_id: partner.id,
      payload: {
        taxFormType: input.taxFormType,
        complianceDecision: input.complianceDecision,
        partnerStatus: partner.status,
      },
    });
  } catch {}

  return partner;
}

/**
 * Step 181.3: Records a visitor referral click and issues a 30-day attribution token.
 */
export async function recordReferralClick(input: {
  tenantId: string;
  referralCode: string;
  visitorIp: string;
  landingUrl: string;
}): Promise<ReferralAttributionRecord> {
  let matchedPartner: PartnerRecord | undefined;
  for (const p of partnersStore.values()) {
    if (p.tenantId === input.tenantId && p.referralCode === input.referralCode.toUpperCase()) {
      matchedPartner = p;
      break;
    }
  }

  if (!matchedPartner) {
    throw new Error(`Invalid referral code '${input.referralCode}'.`);
  }

  const attributionId = generateUuidV7();
  const attributionToken = `tok_attr_${crypto.randomBytes(16).toString('hex')}`;
  const visitorIpHash = crypto.createHash('sha256').update(input.visitorIp).digest('hex').slice(0, 16);

  const expiresDate = new Date();
  expiresDate.setDate(expiresDate.getDate() + ATTRIBUTION_WINDOW_DAYS);
  const now = new Date().toISOString();

  const record: ReferralAttributionRecord = {
    id: attributionId,
    tenantId: input.tenantId,
    partnerId: matchedPartner.id,
    attributionToken,
    visitorIpHash,
    landingUrl: input.landingUrl,
    status: 'clicked',
    expiresAt: expiresDate.toISOString(),
    createdAt: now,
  };

  attributionsStore.set(attributionToken, record);

  logger.info('Partner referral click recorded and attribution token generated', {
    partnerId: matchedPartner.id,
    attributionToken,
  });

  return record;
}

/**
 * Step 181.4: Attributes newly registered merchant company to partner.
 */
export async function attributeMerchantRegistration(input: {
  tenantId: string;
  attributionToken: string;
  companyId: string;
}): Promise<ReferralAttributionRecord> {
  const attribution = attributionsStore.get(input.attributionToken);
  if (!attribution) {
    throw new Error(`Attribution token '${input.attributionToken}' was not found.`);
  }

  if (new Date(attribution.expiresAt).getTime() < Date.now()) {
    attribution.status = 'expired';
    throw new Error('Attribution token has expired (exceeded 30-day attribution window).');
  }

  attribution.referredCompanyId = input.companyId;
  attribution.status = 'registered';

  logger.info('Merchant registration successfully attributed to partner', {
    partnerId: attribution.partnerId,
    companyId: input.companyId,
    attributionToken: input.attributionToken,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'PARTNER_MERCHANT_ATTRIBUTED',
      entity_type: 'partner_referral_attribution',
      entity_id: attribution.id,
      payload: {
        partnerId: attribution.partnerId,
        referredCompanyId: input.companyId,
      },
    });
  } catch {}

  return attribution;
}

export function getPartner(id: string): PartnerRecord | undefined {
  return partnersStore.get(id);
}

export function getReferralAttribution(token: string): ReferralAttributionRecord | undefined {
  return attributionsStore.get(token);
}

export function resetPartnerEngineStore(): void {
  partnersStore.clear();
  attributionsStore.clear();
}
