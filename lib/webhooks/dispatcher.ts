// path: lib/webhooks/dispatcher.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import type { PaymentProcessorSlug } from '@/types/processors';
import { processorFactory } from '@/lib/processors/factory';

export interface WebhookEventEnvelope {
  id: string;
  provider: PaymentProcessorSlug;
  eventType: string;
  providerEventId?: string | undefined;
  rawBody: string;
  headers: Record<string, string>;
  parsedPayload?: Record<string, unknown> | undefined;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  receivedAt: string;
  processedAt?: string | undefined;
  error?: string | undefined;
}

export type WebhookHandlerFn = (event: WebhookEventEnvelope) => Promise<void>;

interface RegisteredHandler {
  provider: PaymentProcessorSlug | '*';
  eventType: string | '*';
  handler: WebhookHandlerFn;
}

// In-memory queue and handler registry for runtime async processing and test isolation
const webhookQueue: WebhookEventEnvelope[] = [];
const registeredHandlers: RegisteredHandler[] = [];

/**
 * Normalizes user/URL provider slugs to canonical PaymentProcessorSlug.
 */
export function normalizeProviderSlug(rawSlug: string): PaymentProcessorSlug | null {
  const cleaned = rawSlug.trim().toLowerCase();
  switch (cleaned) {
    case 'stripe':
    case 'stripe_connect':
      return 'stripe_connect';
    case 'nmi':
      return 'nmi';
    case 'rainforest':
      return 'rainforest';
    case 'airwallex':
      return 'airwallex';
    case 'payoneer':
      return 'payoneer';
    default:
      return null;
  }
}

/**
 * Extracts provider-specific signature header from incoming HTTP headers.
 */
export function extractSignatureHeader(
  provider: PaymentProcessorSlug,
  headers: Headers | Record<string, string>
): string {
  const getHeader = (name: string): string | null => {
    if ('get' in headers && typeof headers.get === 'function') {
      return headers.get(name) ?? headers.get(name.toLowerCase());
    }
    const record = headers as Record<string, string>;
    return record[name] ?? record[name.toLowerCase()] ?? null;
  };

  switch (provider) {
    case 'stripe_connect':
      return getHeader('stripe-signature') ?? '';
    case 'rainforest':
      return getHeader('rainforest-signature') ?? getHeader('x-rainforest-signature') ?? '';
    case 'nmi':
      return getHeader('nmi-signature') ?? getHeader('x-nmi-signature') ?? getHeader('webhook-signature') ?? '';
    case 'airwallex':
      return getHeader('x-signature') ?? getHeader('airwallex-signature') ?? '';
    case 'payoneer':
      return getHeader('payoneer-signature') ?? getHeader('x-payoneer-signature') ?? getHeader('authorization') ?? '';
  }
}

/**
 * Cryptographically verifies webhook signature against provider adapter contract.
 */
export async function verifyIncomingWebhook(params: {
  provider: PaymentProcessorSlug;
  rawBody: string;
  signature: string;
  webhookSecret?: string | undefined;
}): Promise<{
  isValid: boolean;
  eventType: string;
  providerEventId?: string | undefined;
  parsedPayload?: Record<string, unknown> | undefined;
  failureReason?: string | undefined;
}> {
  const adapter = processorFactory.getAdapter(params.provider);
  const secret = params.webhookSecret ?? process.env[`${params.provider.toUpperCase()}_WEBHOOK_SECRET`] ?? 'whsec_test_mock_secret';

  const result = await adapter.verifyWebhook(params.rawBody, params.signature, secret);

  return {
    isValid: result.isValid,
    eventType: result.eventType ?? 'unknown',
    providerEventId: result.providerEventId,
    parsedPayload: result.parsedPayload,
    failureReason: result.failureReason,
  };
}

/**
 * Enqueues a verified webhook event for asynchronous ledger and notification processing.
 */
export async function enqueueWebhookEvent(event: WebhookEventEnvelope): Promise<void> {
  webhookQueue.push(event);

  logger.info('Webhook event successfully enqueued for async background processing', {
    eventId: event.id,
    provider: event.provider,
    eventType: event.eventType,
    providerEventId: event.providerEventId,
  });

  // Execute background handlers asynchronously without blocking the 2-second HTTP response
  void dispatchWebhookEvent(event);
}

/**
 * Dispatches an event envelope to registered background handlers.
 */
export async function dispatchWebhookEvent(event: WebhookEventEnvelope): Promise<void> {
  event.status = 'processing';

  const matchingHandlers = registeredHandlers.filter(
    (h) =>
      (h.provider === '*' || h.provider === event.provider) &&
      (h.eventType === '*' || h.eventType === event.eventType)
  );

  for (const h of matchingHandlers) {
    try {
      await h.handler(event);
    } catch (handlerErr: unknown) {
      logger.error('Error executing background webhook handler', {
        eventId: event.id,
        provider: event.provider,
        eventType: event.eventType,
        error: handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
      });
      event.error = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
      event.status = 'failed';
    }
  }

  if (event.status !== 'failed') {
    event.status = 'completed';
    event.processedAt = new Date().toISOString();
  }
}

/**
 * Registers an asynchronous background event handler for payment webhooks.
 */
export function registerWebhookHandler(
  provider: PaymentProcessorSlug | '*',
  eventType: string | '*',
  handler: WebhookHandlerFn
): () => void {
  const entry: RegisteredHandler = { provider, eventType, handler };
  registeredHandlers.push(entry);

  return () => {
    const idx = registeredHandlers.indexOf(entry);
    if (idx !== -1) {
      registeredHandlers.splice(idx, 1);
    }
  };
}

/**
 * Retrieves enqueued webhook events (primarily for assertions and diagnostics).
 */
export function getEnqueuedWebhookEvents(
  provider?: PaymentProcessorSlug
): readonly WebhookEventEnvelope[] {
  if (provider) {
    return webhookQueue.filter((e) => e.provider === provider);
  }
  return [...webhookQueue];
}

/**
 * Clears enqueued webhook events and handlers for unit test isolation.
 */
export function clearWebhookQueue(): void {
  webhookQueue.length = 0;
  registeredHandlers.length = 0;
}
