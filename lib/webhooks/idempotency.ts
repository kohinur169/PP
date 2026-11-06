// path: lib/webhooks/idempotency.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import type { PaymentProcessorSlug } from '@/types/processors';

export type WebhookEventStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface WebhookEventRecord {
  id: string;
  tenantId: string;
  provider: PaymentProcessorSlug;
  eventId: string;
  eventType: string;
  status: WebhookEventStatus;
  payload: Record<string, unknown>;
  lockExpiresAt?: string | undefined;
  completedAt?: string | undefined;
  errorMessage?: string | undefined;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookLockResult {
  acquired: boolean;
  status: WebhookEventStatus;
  isAlreadyCompleted: boolean;
  isAlreadyProcessing: boolean;
  eventId: string;
  provider: PaymentProcessorSlug;
  message: string;
}

export interface AcquireLockParams {
  tenantId: string;
  provider: PaymentProcessorSlug;
  eventId: string;
  eventType: string;
  payload?: Record<string, unknown> | undefined;
  lockTtlSeconds?: number | undefined;
}

// In-memory runtime lock store for tests and high-concurrency event deduplication
const runtimeLockStore = new Map<string, WebhookEventRecord>();

function makeEventKey(provider: PaymentProcessorSlug, eventId: string): string {
  return `${provider}:${eventId}`;
}

/**
 * Acquires a distributed idempotency lock for an incoming payment webhook event (Step 128.2).
 * Returns false if the event is already processing or has previously completed.
 */
export async function acquireWebhookLock(params: AcquireLockParams): Promise<WebhookLockResult> {
  const key = makeEventKey(params.provider, params.eventId);
  const now = new Date();
  const ttlSeconds = params.lockTtlSeconds ?? 30; // 30-second processing lock
  const lockExpiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const existing = runtimeLockStore.get(key);

  if (existing) {
    // 1. Event already completed previously: return immediately without re-processing
    if (existing.status === 'completed') {
      logger.info('Webhook event already completed; suppressing duplicate processing', {
        provider: params.provider,
        eventId: params.eventId,
      });

      return {
        acquired: false,
        status: 'completed',
        isAlreadyCompleted: true,
        isAlreadyProcessing: false,
        eventId: params.eventId,
        provider: params.provider,
        message: 'Event was already completed previously.',
      };
    }

    // 2. Event is currently processing: check if lock has expired (stale lock recovery)
    if (existing.status === 'processing') {
      const lockExpired = existing.lockExpiresAt ? new Date(existing.lockExpiresAt) <= now : false;

      if (!lockExpired) {
        logger.warn('Webhook event is currently processing under active lock', {
          provider: params.provider,
          eventId: params.eventId,
          lockExpiresAt: existing.lockExpiresAt,
        });

        return {
          acquired: false,
          status: 'processing',
          isAlreadyCompleted: false,
          isAlreadyProcessing: true,
          eventId: params.eventId,
          provider: params.provider,
          message: 'Event is currently processing under an active lock.',
        };
      }

      // Lock expired: reclaim lock
      logger.warn('Reclaiming stale webhook lock after timeout', {
        provider: params.provider,
        eventId: params.eventId,
        previousExpiresAt: existing.lockExpiresAt,
      });
    }
  }

  // Acquire / refresh lock
  const record: WebhookEventRecord = {
    id: existing?.id ?? generateUuidV7(),
    tenantId: params.tenantId,
    provider: params.provider,
    eventId: params.eventId,
    eventType: params.eventType,
    status: 'processing',
    payload: params.payload ?? {},
    lockExpiresAt,
    retryCount: existing ? existing.retryCount + 1 : 0,
    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };

  runtimeLockStore.set(key, record);

  logger.info('Acquired webhook event processing lock', {
    provider: params.provider,
    eventId: params.eventId,
    lockExpiresAt,
  });

  return {
    acquired: true,
    status: 'processing',
    isAlreadyCompleted: false,
    isAlreadyProcessing: false,
    eventId: params.eventId,
    provider: params.provider,
    message: 'Webhook lock acquired successfully.',
  };
}

/**
 * Marks a webhook event as successfully completed and releases lock (Step 128.3).
 */
export async function completeWebhookEvent(
  provider: PaymentProcessorSlug,
  eventId: string
): Promise<void> {
  const key = makeEventKey(provider, eventId);
  const existing = runtimeLockStore.get(key);

  if (!existing) {
    return;
  }

  existing.status = 'completed';
  existing.completedAt = new Date().toISOString();
  existing.lockExpiresAt = undefined;
  existing.updatedAt = new Date().toISOString();

  logger.info('Webhook event marked as completed', {
    provider,
    eventId,
  });
}

/**
 * Marks a webhook event as failed and releases lock for future retries.
 */
export async function failWebhookEvent(
  provider: PaymentProcessorSlug,
  eventId: string,
  errorMessage: string
): Promise<void> {
  const key = makeEventKey(provider, eventId);
  const existing = runtimeLockStore.get(key);

  if (!existing) {
    return;
  }

  existing.status = 'failed';
  existing.errorMessage = errorMessage;
  existing.lockExpiresAt = undefined;
  existing.updatedAt = new Date().toISOString();

  logger.warn('Webhook event processing failed', {
    provider,
    eventId,
    error: errorMessage,
  });
}

/**
 * Wraps an arbitrary webhook processing action with idempotent deduplication.
 * If the event previously completed, returns HTTP 200 immediately without executing action.
 */
export async function processWebhookWithIdempotency<T>(params: {
  tenantId: string;
  provider: PaymentProcessorSlug;
  eventId: string;
  eventType: string;
  payload?: Record<string, unknown> | undefined;
  execute: () => Promise<T>;
}): Promise<{
  executed: boolean;
  httpStatus: number;
  result?: T | undefined;
  message: string;
}> {
  const lock = await acquireWebhookLock({
    tenantId: params.tenantId,
    provider: params.provider,
    eventId: params.eventId,
    eventType: params.eventType,
    payload: params.payload,
  });

  // Step 128.3: If event previously completed, return HTTP 200 immediately without re-executing
  if (lock.isAlreadyCompleted) {
    return {
      executed: false,
      httpStatus: 200,
      message: 'Event previously completed; returning cached HTTP 200.',
    };
  }

  if (!lock.acquired) {
    return {
      executed: false,
      httpStatus: 409,
      message: 'Concurrent webhook delivery already in flight under active lock.',
    };
  }

  try {
    const result = await params.execute();
    await completeWebhookEvent(params.provider, params.eventId);

    return {
      executed: true,
      httpStatus: 200,
      result,
      message: 'Webhook processed and marked as completed.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await failWebhookEvent(params.provider, params.eventId, msg);
    throw err;
  }
}

/**
 * Resets runtime lock store for test isolation.
 */
export function resetWebhookLockStore(): void {
  runtimeLockStore.clear();
}
