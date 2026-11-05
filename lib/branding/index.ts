// path: lib/branding/index.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export interface MerchantBrandingConfig {
  id: string;
  tenantId: string;
  companyId: string;
  logoUrl?: string | undefined;
  primaryColor: string;
  accentColor: string;
  footerNote?: string | undefined;
  updatedAt: string;
}

export const PLATFORM_DEFAULT_BRANDING: MerchantBrandingConfig = {
  id: 'default_platform_branding',
  tenantId: 'default',
  companyId: 'default',
  logoUrl: 'https://assets.kd.pay/brand/logo.png',
  primaryColor: '#0284c7', // Sky-600
  accentColor: '#0369a1',  // Sky-700
  footerNote: 'Powered by KD Solution IT PayFac. Secure transaction processing.',
  updatedAt: new Date().toISOString(),
};

const brandingStore = new Map<string, MerchantBrandingConfig>();
const auditRepo = new AuditLogRepository();

/**
 * Step 199.1 & 199.2: Configures custom merchant branding if entitled.
 */
export async function updateMerchantBranding(input: {
  tenantId: string;
  companyId: string;
  companyEntitlements: string[];
  logoUrl?: string | undefined;
  primaryColor?: string | undefined;
  accentColor?: string | undefined;
  footerNote?: string | undefined;
  actorId?: string | undefined;
}): Promise<MerchantBrandingConfig> {
  const isEntitled = input.companyEntitlements.includes('custom_branding');

  if (!isEntitled) {
    logger.warn('Merchant attempted to set custom branding without plan entitlement', {
      companyId: input.companyId,
    });
    return PLATFORM_DEFAULT_BRANDING;
  }

  const existing = brandingStore.get(input.companyId);
  const id = existing?.id ?? generateUuidV7();
  const now = new Date().toISOString();

  const config: MerchantBrandingConfig = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    logoUrl: input.logoUrl ?? existing?.logoUrl,
    primaryColor: input.primaryColor ?? existing?.primaryColor ?? PLATFORM_DEFAULT_BRANDING.primaryColor,
    accentColor: input.accentColor ?? existing?.accentColor ?? PLATFORM_DEFAULT_BRANDING.accentColor,
    footerNote: input.footerNote ?? existing?.footerNote ?? PLATFORM_DEFAULT_BRANDING.footerNote,
    updatedAt: now,
  };

  brandingStore.set(input.companyId, config);

  logger.info('Merchant custom branding saved', {
    companyId: input.companyId,
    primaryColor: config.primaryColor,
    hasLogo: Boolean(config.logoUrl),
  });

  try {
    await auditRepo.append({
      actor_id: input.actorId ?? '00000000-0000-4000-8000-000000000000',
      action: 'MERCHANT_BRANDING_UPDATED',
      entity_type: 'merchant_branding',
      entity_id: id,
      payload: {
        primaryColor: config.primaryColor,
        logoUrl: config.logoUrl,
      },
    });
  } catch {}

  return config;
}

/**
 * Step 199.4: Resolves branding for invoices and checkout pages. Falls back to default platform branding if unentitled.
 */
export function resolveMerchantBranding(
  companyId: string,
  companyEntitlements: string[]
): MerchantBrandingConfig {
  const isEntitled = companyEntitlements.includes('custom_branding');
  if (!isEntitled) {
    return PLATFORM_DEFAULT_BRANDING;
  }

  return brandingStore.get(companyId) ?? PLATFORM_DEFAULT_BRANDING;
}

export function resetBrandingStore(): void {
  brandingStore.clear();
}
