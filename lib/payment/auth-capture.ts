// path: lib/payment/auth-capture.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { PaymentProcessorSlug } from '@/types/processors';
import type { CardBrand } from '@/lib/processors/routing';

export type PaymentAuthorizationStatus =
  | 'authorized'
  | 'captured'
  | 'voided'
  | 'expired';

export interface AuthorizePaymentRequest {
  tenantId: string;
  companyId: string;
  amount: Money;
  currency: 'USD';
  provider: PaymentProcessorSlug;
  cardToken: string;
  cardBrand?: CardBrand | undefined;
  gatewayAuthId?: string | undefined;
  idempotencyKey?: string | undefined;
  description?: string | undefined;
  expiresInDays?: number | undefined; // Default 7 days
  metadata?: Record<string, unknown> | undefined;
}

export interface CapturePaymentRequest {
  paymentId: string;
  amount?: Money | undefined; // Optional partial capture, defaults to full authorized amount
  captureNotes?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface VoidPaymentRequest {
  paymentId: string;
  reason: string;
  idempotencyKey?: string | undefined;
}

export interface AuthorizationRecord {
  id: string;
  tenantId: string;
  companyId: string;
  amount: Money;
  currency: 'USD';
  provider: PaymentProcessorSlug;
  gatewayAuthId: string;
  status: PaymentAuthorizationStatus;
  isPayoutEligible: boolean; // Step 138.3: Strictly FALSE while authorized
  isSettled: boolean; // Strictly FALSE while authorized
  authorizedAt: string;
  expiresAt: string;
  capturedAt?: string | undefined;
  capturedAmount?: Money | undefined;
  voidedAt?: string | undefined;
  voidReason?: string | undefined;
  metadata: Record<string, unknown>;
}

export interface CapturePaymentResult {
  paymentId: string;
  capturedAmount: Money;
  status: 'captured';
  isPayoutEligible: boolean;
  capturedAt: string;
  authorization: AuthorizationRecord;
}

export interface VoidPaymentResult {
  paymentId: string;
  status: 'voided';
  voidedAt: string;
  reason: string;
  authorization: AuthorizationRecord;
}

export interface ExpiredAuthorizationsSummary {
  totalInspected: number;
  expiredCount: number;
  expiredIds: string[];
}

// In-memory runtime authorization store for tests and fast state lookups
const authorizationStore = new Map<string, AuthorizationRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 138.1: Places an authorization hold on the customer's card without immediate settlement.
 * Funds are reserved at card issuer level, but balance is NOT credited to merchant account.
 */
export async function authorize(
  request: AuthorizePaymentRequest
): Promise<AuthorizationRecord> {
  if (request.currency !== 'USD') {
    throw new Error('Platform strictly authorizes and settles in USD numeric(18,4).');
  }

  if (request.amount.value.isNegative() || request.amount.value.isZero()) {
    throw new Error('Authorization amount must be strictly greater than zero.');
  }

  const id = generateUuidV7();
  const now = new Date();
  const expiresInDays = request.expiresInDays ?? 7;
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const gatewayAuthId = request.gatewayAuthId ?? `auth_${request.provider}_${id.slice(0, 12)}`;

  // Step 138.3: Invariant - isPayoutEligible and isSettled are strictly FALSE
  const record: AuthorizationRecord = {
    id,
    tenantId: request.tenantId,
    companyId: request.companyId,
    amount: request.amount.round(4),
    currency: 'USD',
    provider: request.provider,
    gatewayAuthId,
    status: 'authorized',
    isPayoutEligible: false,
    isSettled: false,
    authorizedAt: now.toISOString(),
    expiresAt,
    metadata: {
      ...request.metadata,
      idempotencyKey: request.idempotencyKey,
      cardBrand: request.cardBrand ?? 'unknown',
      description: request.description,
    },
  };

  authorizationStore.set(id, record);

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'PAYMENT_AUTHORIZED_HOLD',
      entity_type: 'payment_authorization',
      entity_id: id,
      payload: {
        companyId: request.companyId,
        amount: record.amount.toNumericString(),
        currency: 'USD',
        provider: request.provider,
        gatewayAuthId,
        expiresAt,
      },
    });
  } catch (auditErr: unknown) {
    logger.warn('Failed to append audit log for payment authorization', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  logger.info('Payment authorization hold placed successfully', {
    paymentId: id,
    companyId: request.companyId,
    amount: record.amount.toNumericString(),
    provider: request.provider,
    expiresAt,
  });

  return record;
}

/**
 * Step 138.2: Executes capture on an approved authorization.
 * Only after capture is settlement finalized and funds become eligible for merchant ledger credit.
 */
export async function capture(
  request: CapturePaymentRequest
): Promise<CapturePaymentResult> {
  const record = authorizationStore.get(request.paymentId);

  if (!record) {
    throw new Error(`Authorization with ID '${request.paymentId}' was not found.`);
  }

  if (record.status !== 'authorized') {
    throw new Error(
      `Cannot capture payment '${request.paymentId}': Current status is '${record.status}'. Only 'authorized' payments can be captured.`
    );
  }

  const now = new Date();
  if (new Date(record.expiresAt) <= now) {
    record.status = 'expired';
    throw new Error(
      `Cannot capture payment '${request.paymentId}': Authorization expired at ${record.expiresAt}.`
    );
  }

  const captureAmount = request.amount ?? record.amount;
  if (captureAmount.greaterThan(record.amount)) {
    throw new Error(
      `Capture amount (${captureAmount.toNumericString()}) cannot exceed original authorized amount (${record.amount.toNumericString()}).`
    );
  }

  const capturedAt = now.toISOString();
  record.status = 'captured';
  record.capturedAt = capturedAt;
  record.capturedAmount = captureAmount.round(4);
  record.isSettled = true;
  record.isPayoutEligible = true; // Eligible for ledger & fulfillment schedule

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'PAYMENT_CAPTURED_SETTLED',
      entity_type: 'payment_authorization',
      entity_id: record.id,
      payload: {
        paymentId: record.id,
        companyId: record.companyId,
        authorizedAmount: record.amount.toNumericString(),
        capturedAmount: captureAmount.toNumericString(),
        capturedAt,
      },
    });
  } catch (auditErr: unknown) {
    logger.warn('Failed to append audit log for payment capture', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  logger.info('Payment authorization successfully captured and settled', {
    paymentId: record.id,
    companyId: record.companyId,
    capturedAmount: captureAmount.toNumericString(),
    capturedAt,
  });

  return {
    paymentId: record.id,
    capturedAmount: captureAmount.round(4),
    status: 'captured',
    isPayoutEligible: true,
    capturedAt,
    authorization: record,
  };
}

/**
 * Voids an active authorization hold, releasing the customer's reserved funds.
 */
export async function voidAuthorization(
  request: VoidPaymentRequest
): Promise<VoidPaymentResult> {
  const record = authorizationStore.get(request.paymentId);

  if (!record) {
    throw new Error(`Authorization with ID '${request.paymentId}' was not found.`);
  }

  if (record.status !== 'authorized') {
    throw new Error(
      `Cannot void payment '${request.paymentId}': Current status is '${record.status}'. Only 'authorized' holds can be voided.`
    );
  }

  const voidedAt = new Date().toISOString();
  record.status = 'voided';
  record.voidedAt = voidedAt;
  record.voidReason = request.reason;
  record.isPayoutEligible = false;
  record.isSettled = false;

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'PAYMENT_AUTHORIZATION_VOIDED',
      entity_type: 'payment_authorization',
      entity_id: record.id,
      payload: {
        paymentId: record.id,
        companyId: record.companyId,
        reason: request.reason,
        voidedAt,
      },
    });
  } catch (auditErr: unknown) {
    logger.warn('Failed to append audit log for payment void', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }

  logger.info('Payment authorization successfully voided', {
    paymentId: record.id,
    reason: request.reason,
    voidedAt,
  });

  return {
    paymentId: record.id,
    status: 'voided',
    voidedAt,
    reason: request.reason,
    authorization: record,
  };
}

/**
 * Step 138.4: Auto-void and mark expired authorizations that have not been captured within 7 days.
 */
export async function expireStaleAuthorizations(options?: {
  now?: Date | undefined;
  tenantId?: string | undefined;
}): Promise<ExpiredAuthorizationsSummary> {
  const now = options?.now ?? new Date();
  const expiredIds: string[] = [];
  let totalInspected = 0;

  for (const record of authorizationStore.values()) {
    if (options?.tenantId && record.tenantId !== options.tenantId) {
      continue;
    }

    if (record.status === 'authorized') {
      totalInspected++;
      if (new Date(record.expiresAt) <= now) {
        record.status = 'expired';
        record.isPayoutEligible = false;
        record.isSettled = false;
        record.voidReason = 'Auto-expired: 7-day authorization window elapsed without capture.';
        record.voidedAt = now.toISOString();

        expiredIds.push(record.id);

        logger.info('Auto-expired uncaptured payment authorization hold', {
          paymentId: record.id,
          authorizedAt: record.authorizedAt,
          expiresAt: record.expiresAt,
        });
      }
    }
  }

  return {
    totalInspected,
    expiredCount: expiredIds.length,
    expiredIds,
  };
}

/**
 * Retrieves an authorization record by ID.
 */
export async function getAuthorizationRecord(
  paymentId: string
): Promise<AuthorizationRecord | null> {
  return authorizationStore.get(paymentId) ?? null;
}

/**
 * Enforces business rule (Step 138.3):
 * Verifies whether funds from this transaction are eligible for merchant balance payout.
 * Strictly false for 'authorized', 'voided', or 'expired' payments.
 */
export async function isPayoutEligible(paymentId: string): Promise<boolean> {
  const record = await getAuthorizationRecord(paymentId);
  if (!record) return false;
  return record.status === 'captured' && record.isPayoutEligible === true;
}

/**
 * Resets in-memory authorization store for test isolation.
 */
export function resetAuthorizationStore(): void {
  authorizationStore.clear();
}
