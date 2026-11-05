// path: lib/payment-links/index.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export class MissingPlanEntitlementError extends Error {
  constructor(entitlement: string) {
    super(`Plan upgrade required: Merchant plan does not include the '${entitlement}' feature.`);
    this.name = 'MissingPlanEntitlementError';
  }
}

export class DeactivatedPaymentLinkError extends Error {
  constructor(slug: string) {
    super(`Payment link '${slug}' is currently deactivated or archived.`);
    this.name = 'DeactivatedPaymentLinkError';
  }
}

export interface PaymentLinkRecord {
  id: string;
  tenantId: string;
  companyId: string;
  slug: string;
  title: string;
  description?: string | undefined;
  amountUsd: string;
  isFixedAmount: boolean;
  currency: string;
  isActive: boolean;
  redirectUrl?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

const paymentLinksStore = new Map<string, PaymentLinkRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 198.2: Verifies merchant plan contains 'payment_links' entitlement.
 */
export function assertPlanEntitlement(
  companyEntitlements: string[],
  requiredEntitlement = 'payment_links'
): void {
  if (!companyEntitlements.includes(requiredEntitlement)) {
    throw new MissingPlanEntitlementError(requiredEntitlement);
  }
}

/**
 * Step 198.1: Creates a reusable payment link if entitled under active merchant plan.
 */
export async function createPaymentLink(input: {
  tenantId: string;
  companyId: string;
  companyEntitlements: string[];
  title: string;
  slug?: string | undefined;
  description?: string | undefined;
  amountUsd?: string | number | undefined;
  isFixedAmount?: boolean | undefined;
  currency?: string | undefined;
  redirectUrl?: string | undefined;
  actorId?: string | undefined;
}): Promise<PaymentLinkRecord> {
  // Plan entitlement guard
  assertPlanEntitlement(input.companyEntitlements, 'payment_links');

  const id = generateUuidV7();
  const slug = (
    input.slug ??
    `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${generateUuidV7().slice(0, 8)}`
  ).trim();

  const now = new Date().toISOString();
  const amountStr = input.amountUsd ? Number(input.amountUsd).toFixed(4) : '0.0000';

  const record: PaymentLinkRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    slug,
    title: input.title,
    description: input.description,
    amountUsd: amountStr,
    isFixedAmount: input.isFixedAmount ?? true,
    currency: input.currency ?? 'USD',
    isActive: true,
    redirectUrl: input.redirectUrl,
    createdAt: now,
    updatedAt: now,
  };

  paymentLinksStore.set(slug, record);

  logger.info('Reusable payment link created', {
    paymentLinkId: id,
    companyId: input.companyId,
    slug,
    amount: amountStr,
  });

  try {
    await auditRepo.append({
      actor_id: input.actorId ?? '00000000-0000-4000-8000-000000000000',
      action: 'PAYMENT_LINK_CREATED',
      entity_type: 'payment_link',
      entity_id: id,
      payload: {
        slug,
        title: input.title,
        amount: amountStr,
      },
    });
  } catch {}

  return record;
}

/**
 * Step 198.3 & 198.4: Resolves payment link for public checkout; throws error if deactivated.
 */
export function resolvePaymentLinkForCheckout(slug: string): PaymentLinkRecord {
  const record = paymentLinksStore.get(slug);
  if (!record) {
    throw new Error(`Payment link with slug '${slug}' not found.`);
  }

  if (!record.isActive) {
    throw new DeactivatedPaymentLinkError(slug);
  }

  return record;
}

export function setPaymentLinkActiveStatus(slug: string, isActive: boolean): PaymentLinkRecord {
  const record = paymentLinksStore.get(slug);
  if (!record) {
    throw new Error(`Payment link '${slug}' not found.`);
  }

  record.isActive = isActive;
  record.updatedAt = new Date().toISOString();
  return record;
}

export function resetPaymentLinksStore(): void {
  paymentLinksStore.clear();
}
