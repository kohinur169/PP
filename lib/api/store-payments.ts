// path: lib/api/store-payments.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { Money } from '@/lib/money/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { authenticateApiKey, type MerchantApiKeyRecord } from '@/lib/api/api-keys';

export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'canceled';

export interface StorePaymentIntentRecord {
  id: string;
  tenantId: string;
  companyId: string;
  apiKeyId: string;
  clientSecret: string;
  orderId: string;
  amount: Money;
  currency: 'USD';
  status: PaymentIntentStatus;
  customerEmail?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStorePaymentIntentInput {
  apiKey: string;
  orderId: string;
  amount: Money;
  currency: 'USD';
  customerEmail?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  ipAddress?: string | undefined;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export class StoreApiRateLimitExceededError extends Error {
  public readonly code = 'STORE_API_RATE_LIMIT_EXCEEDED';
  public readonly statusCode = 429;
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      `Rate limit exceeded: Please wait ${retryAfterSeconds} seconds before sending further online store payment requests.`
    );
    this.name = 'StoreApiRateLimitExceededError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const DEFAULT_STORE_API_RATE_LIMIT_PER_MINUTE = 60;
const rateLimitWindowMs = 60 * 1000; // 1 minute sliding window

// In-memory sliding window request tracking per company ID
const rateLimitTracker = new Map<string, number[]>();
const intentStoreById = new Map<string, StorePaymentIntentRecord>();
const intentStoreBySecret = new Map<string, StorePaymentIntentRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Checks and increments rate limit counter for a merchant company.
 * Section 20: "Every API call requires authentication and is rate limited and audit logged."
 */
export function checkStoreApiRateLimit(
  companyId: string,
  nowMs: number = Date.now(),
  limitPerMinute: number = DEFAULT_STORE_API_RATE_LIMIT_PER_MINUTE
): RateLimitCheckResult {
  const windowStart = nowMs - rateLimitWindowMs;
  let timestamps = rateLimitTracker.get(companyId) ?? [];

  // Filter out timestamps outside sliding window
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= limitPerMinute) {
    const oldest = timestamps[0] ?? nowMs;
    const resetSeconds = Math.max(1, Math.ceil((oldest + rateLimitWindowMs - nowMs) / 1000));
    rateLimitTracker.set(companyId, timestamps);

    return {
      allowed: false,
      limit: limitPerMinute,
      remaining: 0,
      resetSeconds,
    };
  }

  // Record this attempt
  timestamps.push(nowMs);
  rateLimitTracker.set(companyId, timestamps);

  const remaining = Math.max(0, limitPerMinute - timestamps.length);
  return {
    allowed: true,
    limit: limitPerMinute,
    remaining,
    resetSeconds: 60,
  };
}

/**
 * Step 146.1: Public Online Store Payment Intent API.
 * Section 20: "A public API exists for online store payments only."
 */
export async function createStorePaymentIntent(
  input: CreateStorePaymentIntentInput
): Promise<{ intent: StorePaymentIntentRecord; rateLimit: RateLimitCheckResult }> {
  // 1. Authenticate API Key
  const keyRecord: MerchantApiKeyRecord = await authenticateApiKey(input.apiKey);

  // 2. Enforce Per-Merchant Rate Limit
  const rateLimit = checkStoreApiRateLimit(keyRecord.companyId);
  if (!rateLimit.allowed) {
    logger.warn('Store payment API rate limit exceeded', {
      companyId: keyRecord.companyId,
      retryAfterSeconds: rateLimit.resetSeconds,
    });
    throw new StoreApiRateLimitExceededError(rateLimit.resetSeconds);
  }

  // 3. Currency Validation: strictly USD
  if (input.currency !== 'USD') {
    throw new Error('Invalid currency: Platform strictly settles and processes online store payments in USD.');
  }

  if (input.amount.lessThanOrEqual(Money.from('0.0000'))) {
    throw new Error('Payment intent amount must be strictly greater than zero.');
  }

  const now = new Date().toISOString();
  const id = generateUuidV7();
  const clientSecret = `pi_sec_${generateUuidV7().replace(/-/g, '')}`;

  const intent: StorePaymentIntentRecord = {
    id,
    tenantId: keyRecord.tenantId,
    companyId: keyRecord.companyId,
    apiKeyId: keyRecord.id,
    clientSecret,
    orderId: input.orderId,
    amount: input.amount,
    currency: 'USD',
    status: 'requires_payment_method',
    customerEmail: input.customerEmail,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };

  intentStoreById.set(id, intent);
  intentStoreBySecret.set(clientSecret, intent);

  logger.info('Store payment intent created via public API', {
    intentId: id,
    companyId: keyRecord.companyId,
    orderId: input.orderId,
    amount: input.amount.toNumericString(),
  });

  // 4. Audit Log
  try {
    await auditRepo.append({
      actor_id: keyRecord.id,
      action: 'STORE_API_PAYMENT_INTENT_CREATED',
      entity_type: 'store_payment_intent',
      entity_id: id,
      payload: {
        companyId: keyRecord.companyId,
        orderId: input.orderId,
        amount: input.amount.toNumericString(),
        currency: 'USD',
        apiKeyId: keyRecord.id,
        clientSecretMasked: `pi_sec_••••••••••••${clientSecret.slice(-4)}`,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for store payment intent', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { intent, rateLimit };
}

/**
 * Step 146.2: Retrieves payment intent by ID after authenticating API key.
 */
export async function getStorePaymentIntent(
  intentId: string,
  apiKey: string
): Promise<StorePaymentIntentRecord> {
  const keyRecord = await authenticateApiKey(apiKey);

  const rateLimit = checkStoreApiRateLimit(keyRecord.companyId);
  if (!rateLimit.allowed) {
    throw new StoreApiRateLimitExceededError(rateLimit.resetSeconds);
  }

  const intent = intentStoreById.get(intentId);
  if (!intent || intent.companyId !== keyRecord.companyId) {
    throw new Error(`Store payment intent '${intentId}' was not found.`);
  }

  return intent;
}

/**
 * Resets the in-memory intent store and rate limiter for test isolation.
 */
export function resetStorePaymentsState(): void {
  rateLimitTracker.clear();
  intentStoreById.clear();
  intentStoreBySecret.clear();
}
