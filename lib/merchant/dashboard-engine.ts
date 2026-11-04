// path: lib/merchant/dashboard-engine.ts

import crypto from 'node:crypto';
import { Role, Permission, assertPermission } from '@/lib/auth/roles';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export interface RecentTransactionItem {
  readonly id: string;
  readonly amountUsd: number;
  readonly status: 'succeeded' | 'pending' | 'failed' | 'refunded' | 'disputed';
  readonly customerEmail: string;
  readonly createdAt: string;
}

export interface MerchantDashboardMetrics {
  readonly companyId: string;
  readonly businessName: string;
  readonly riskTier: 1 | 2 | 3;
  readonly grossVolumeUsd: number;
  readonly netSettledUsd: number;
  readonly availableBalanceUsd: number;
  readonly pendingSettlementUsd: number;
  readonly rollingReserveUsd: number;
  readonly activeHoldsUsd: number;
  readonly disputeCount: number;
  readonly totalTransactionsCount: number;
  readonly chargebackRatePercent: number;
  readonly chargebackRateBreached: boolean;
  readonly recentTransactions: RecentTransactionItem[];
}

export interface MerchantCompanySettings {
  readonly companyId: string;
  legalName: string;
  dbaName: string;
  supportEmail: string;
  supportPhone: string;
  statementDescriptor: string;
  payoutSchedule: 'daily' | 'weekly' | 'monthly';
  bankAccountMasked: string;
  readonly ownerUserId: string;
}

// In-memory tenant stores for dashboard state
const metricsStore = new Map<string, MerchantDashboardMetrics>();
const settingsStore = new Map<string, MerchantCompanySettings>();

/**
 * Resets stores for test isolation.
 */
export function resetMerchantDataForTest(): void {
  metricsStore.clear();
  settingsStore.clear();
}

/**
 * Seeds metrics for a company.
 */
export function seedMerchantMetricsForTest(metrics: MerchantDashboardMetrics): void {
  metricsStore.set(metrics.companyId, {
    ...metrics,
    recentTransactions: [...metrics.recentTransactions],
  });
}

/**
 * Seeds company settings.
 */
export function seedMerchantSettingsForTest(settings: MerchantCompanySettings): void {
  settingsStore.set(settings.companyId, { ...settings });
}

/**
 * Step 072.3: Enforces single-owner per company rule.
 * Verifies that the authenticated actor is the sole legitimate owner of the requested company.
 */
export function assertSingleOwnerCompanyAccess(
  actorUserId: string,
  actorRole: Role,
  targetCompanyId: string,
  sessionCompanyId?: string | undefined
): void {
  // Super Admin can inspect cross-tenant, but OWNER cannot
  if (actorRole === Role.SUPER_ADMIN) {
    return;
  }

  if (actorRole !== Role.OWNER) {
    throw new Error(`Access Denied: Role "${actorRole}" cannot access merchant owner portal.`);
  }

  if (sessionCompanyId && sessionCompanyId !== targetCompanyId) {
    logger.warn('Cross-tenant company access violation blocked for merchant owner', {
      actorUserId,
      sessionCompanyId,
      targetCompanyId,
      violation: 'TENANT_BOUNDARY_BREACH',
    });
    throw new Error(
      `Access Denied: Tenant boundary breach. Owner is restricted to company "${sessionCompanyId}".`
    );
  }

  const settings = settingsStore.get(targetCompanyId);
  if (settings && settings.ownerUserId !== actorUserId) {
    logger.warn('Single-owner rule violation detected', {
      actorUserId,
      registeredOwner: settings.ownerUserId,
      targetCompanyId,
    });
    throw new Error(
      `Access Denied: User "${actorUserId}" is not the registered owner of company "${targetCompanyId}".`
    );
  }
}

/**
 * Step 072.2: Retrieves sub-merchant financial analytics and volume overview.
 */
export async function getMerchantDashboardMetrics(params: {
  readonly companyId: string;
  readonly actorUserId: string;
  readonly actorRole: Role;
  readonly sessionCompanyId?: string | undefined;
}): Promise<MerchantDashboardMetrics> {
  const { companyId, actorUserId, actorRole, sessionCompanyId } = params;

  assertSingleOwnerCompanyAccess(actorUserId, actorRole, companyId, sessionCompanyId);
  assertPermission(actorRole, Permission.VIEW_MERCHANT_DASHBOARD);

  const metrics = metricsStore.get(companyId);
  if (!metrics) {
    // Return pristine zero-state for newly onboarded sub-merchant
    return {
      companyId,
      businessName: 'My Sub-Merchant Business',
      riskTier: 1,
      grossVolumeUsd: 0,
      netSettledUsd: 0,
      availableBalanceUsd: 0,
      pendingSettlementUsd: 0,
      rollingReserveUsd: 0,
      activeHoldsUsd: 0,
      disputeCount: 0,
      totalTransactionsCount: 0,
      chargebackRatePercent: 0,
      chargebackRateBreached: false,
      recentTransactions: [],
    };
  }

  return {
    ...metrics,
    recentTransactions: [...metrics.recentTransactions],
  };
}

/**
 * Step 072.1: Retrieves sub-merchant company settings profile.
 */
export async function getMerchantSettings(params: {
  readonly companyId: string;
  readonly actorUserId: string;
  readonly actorRole: Role;
  readonly sessionCompanyId?: string | undefined;
}): Promise<MerchantCompanySettings> {
  const { companyId, actorUserId, actorRole, sessionCompanyId } = params;

  assertSingleOwnerCompanyAccess(actorUserId, actorRole, companyId, sessionCompanyId);
  assertPermission(actorRole, Permission.MANAGE_MERCHANT_SETTINGS);

  const settings = settingsStore.get(companyId);
  if (!settings) {
    throw new Error(`Merchant settings for company "${companyId}" not found.`);
  }

  return { ...settings };
}

/**
 * Step 072.1: Updates sub-merchant business profile settings.
 */
export async function updateMerchantSettings(params: {
  readonly companyId: string;
  readonly legalName?: string | undefined;
  readonly dbaName?: string | undefined;
  readonly supportEmail?: string | undefined;
  readonly supportPhone?: string | undefined;
  readonly statementDescriptor?: string | undefined;
  readonly payoutSchedule?: 'daily' | 'weekly' | 'monthly' | undefined;
  readonly actorUserId: string;
  readonly actorRole: Role;
  readonly sessionCompanyId?: string | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<MerchantCompanySettings> {
  const {
    companyId,
    legalName,
    dbaName,
    supportEmail,
    supportPhone,
    statementDescriptor,
    payoutSchedule,
    actorUserId,
    actorRole,
    sessionCompanyId,
    auditRepo,
  } = params;

  assertSingleOwnerCompanyAccess(actorUserId, actorRole, companyId, sessionCompanyId);
  assertPermission(actorRole, Permission.MANAGE_MERCHANT_SETTINGS);

  const settings = settingsStore.get(companyId);
  if (!settings) {
    throw new Error(`Merchant settings for company "${companyId}" not found.`);
  }

  if (legalName !== undefined) settings.legalName = legalName;
  if (dbaName !== undefined) settings.dbaName = dbaName;
  if (supportEmail !== undefined) settings.supportEmail = supportEmail;
  if (supportPhone !== undefined) settings.supportPhone = supportPhone;
  if (statementDescriptor !== undefined) settings.statementDescriptor = statementDescriptor;
  if (payoutSchedule !== undefined) settings.payoutSchedule = payoutSchedule;

  settingsStore.set(companyId, settings);

  logger.info('Merchant company settings updated by owner', {
    companyId,
    actorUserId,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: companyId,
      actor_id: actorUserId,
      action: 'PLATFORM_SETTING_UPDATED',
      entity_type: 'company_settings',
      entity_id: companyId,
      payload: {
        legalName: settings.legalName,
        dbaName: settings.dbaName,
        statementDescriptor: settings.statementDescriptor,
        payoutSchedule: settings.payoutSchedule,
      },
    });
  }

  return { ...settings };
}
