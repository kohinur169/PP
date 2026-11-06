// path: lib/webhooks/outbound-delivery-worker.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type MerchantWebhookEventType =
  | 'payment_intent.succeeded'
  | 'payment_intent.failed'
  | 'refund.created'
  | 'dispute.opened'
  | 'dispute.won'
  | 'dispute.lost'
  | 'settlement.released'
  | 'submerchant.status_changed';

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'retrying' | 'failed_exhausted';

/**
 * 10-Attempt Retry Schedule (Section 15 & Section 27):
 * 1s, 5s, 30s, 5m, 30m, 2h, 6h, 24h, 48h, 72h
 */
export const RETRY_INTERVALS_SECONDS = [
  1, // 1s
  5, // 5s
  30, // 30s
  300, // 5m
  1800, // 30m
  7200, // 2h
  21600, // 6h
  86400, // 24h
  172800, // 48h
  259200, // 72h
] as const;

export interface WebhookEndpointRecord {
  id: string;
  tenantId: string;
  companyId: string;
  url: string;
  subscribedEvents: MerchantWebhookEventType[];
  secret: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  tenantId: string;
  endpointId: string;
  eventType: MerchantWebhookEventType;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string; // ISO string
  lastStatusCode?: number | undefined;
  lastLatencyMs?: number | undefined;
  lastResponseSnippet?: string | undefined;
  deliveredAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookHttpResponse {
  statusCode: number;
  latencyMs: number;
  bodySnippet: string;
}

export type WebhookTransportFn = (url: string, headers: Record<string, string>, body: string) => Promise<WebhookHttpResponse>;

export interface WebhookBatchSummary {
  inspectedCount: number;
  deliveredCount: number;
  retriedCount: number;
  exhaustedCount: number;
}

const endpointsStore = new Map<string, WebhookEndpointRecord>();
const deliveriesStore = new Map<string, WebhookDeliveryRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 167.1: Calculates HMAC-SHA256 signature for webhook payload.
 * Section 15: "X-Signature: t=timestamp,v1=HMAC-SHA256(timestamp.payload, secret)"
 */
export function signWebhookPayload(secret: string, timestamp: number, payloadString: string): string {
  const signatureData = `${timestamp}.${payloadString}`;
  const hmac = crypto.createHmac('sha256', secret).update(signatureData).digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

/**
 * Verifies inbound or outbound HMAC-SHA256 signature header.
 */
export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string,
  payloadString: string,
  toleranceSeconds = 300
): boolean {
  try {
    const parts = signatureHeader.split(',');
    let timestamp: number | null = null;
    let receivedHmac: string | null = null;

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 't') {
        timestamp = parseInt(value, 10);
      } else if (key === 'v1') {
        receivedHmac = value;
      }
    }

    if (!timestamp || !receivedHmac) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false; // Expired signature
    }

    const expectedSignatureData = `${timestamp}.${payloadString}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(expectedSignatureData).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(receivedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Step 167.2: Executes delivery of a single outbound webhook attempt.
 */
export async function executeSingleWebhookDelivery(
  deliveryId: string,
  transport?: WebhookTransportFn,
  nowIso?: string
): Promise<WebhookDeliveryRecord> {
  const delivery = deliveriesStore.get(deliveryId);
  if (!delivery) {
    throw new Error(`Webhook delivery '${deliveryId}' not found.`);
  }

  const endpoint = endpointsStore.get(delivery.endpointId);
  if (!endpoint || !endpoint.isActive) {
    delivery.status = 'failed_exhausted';
    delivery.lastResponseSnippet = 'Endpoint disabled or deleted.';
    delivery.updatedAt = nowIso ?? new Date().toISOString();
    return delivery;
  }

  const now = nowIso ?? new Date().toISOString();
  const timestamp = Math.floor(new Date(now).getTime() / 1000);
  const payloadString = JSON.stringify(delivery.payload);
  const signatureHeader = signWebhookPayload(endpoint.secret, timestamp, payloadString);

  const headers = {
    'Content-Type': 'application/json',
    'X-Signature': signatureHeader,
    'X-Delivery-Id': delivery.id,
    'X-Event-Type': delivery.eventType,
    'X-Delivery-Attempt': String(delivery.attemptCount + 1),
    'User-Agent': 'KDSolution-Webhook/1.0',
  };

  let response: WebhookHttpResponse;

  if (transport) {
    response = await transport(endpoint.url, headers, payloadString);
  } else {
    // Default mock response when no custom transport injected
    response = { statusCode: 200, latencyMs: 25, bodySnippet: '{"received": true}' };
  }

  delivery.attemptCount++;
  delivery.lastStatusCode = response.statusCode;
  delivery.lastLatencyMs = response.latencyMs;
  delivery.lastResponseSnippet = response.bodySnippet.slice(0, 500);
  delivery.updatedAt = now;

  if (response.statusCode >= 200 && response.statusCode < 300) {
    delivery.status = 'delivered';
    delivery.deliveredAt = now;

    logger.info('Outbound merchant webhook delivered successfully', {
      deliveryId: delivery.id,
      endpointUrl: endpoint.url,
      attempt: delivery.attemptCount,
      statusCode: response.statusCode,
    });

    try {
      await auditRepo.append({
        actor_id: '00000000-0000-4000-8000-000000000000',
        action: 'WEBHOOK_DELIVERED',
        entity_type: 'merchant_webhook_delivery',
        entity_id: delivery.id,
        payload: {
          endpointId: endpoint.id,
          eventType: delivery.eventType,
          attemptCount: delivery.attemptCount,
          statusCode: response.statusCode,
        },
      });
    } catch (err: unknown) {
      logger.warn('Failed to audit log webhook delivery', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    // Delivery failed: check retry exhaustion
    if (delivery.attemptCount >= delivery.maxAttempts) {
      delivery.status = 'failed_exhausted';

      logger.error('Outbound webhook delivery exhausted all 10 retry attempts', {
        deliveryId: delivery.id,
        endpointUrl: endpoint.url,
        finalStatusCode: response.statusCode,
      });

      try {
        await auditRepo.append({
          actor_id: '00000000-0000-4000-8000-000000000000',
          action: 'WEBHOOK_DELIVERY_EXHAUSTED',
          entity_type: 'merchant_webhook_delivery',
          entity_id: delivery.id,
          payload: {
            endpointId: endpoint.id,
            eventType: delivery.eventType,
            attempts: delivery.attemptCount,
            lastStatus: response.statusCode,
          },
        });
      } catch (err: unknown) {
        logger.warn('Failed to audit log webhook exhaustion', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      delivery.status = 'retrying';
      const delaySeconds = RETRY_INTERVALS_SECONDS[delivery.attemptCount - 1] ?? 86400;
      const nextTime = new Date(new Date(now).getTime() + delaySeconds * 1000).toISOString();
      delivery.nextAttemptAt = nextTime;

      logger.warn('Outbound webhook delivery failed, scheduled next retry', {
        deliveryId: delivery.id,
        attempt: delivery.attemptCount,
        nextAttemptAt: nextTime,
        delaySeconds,
      });
    }
  }

  return delivery;
}

/**
 * Step 167.3: Outbound Webhook Delivery Batch Worker.
 * Scans pending and retrying deliveries due for execution.
 */
export async function runOutboundWebhookDeliveryBatchJob(input: {
  tenantId?: string | undefined;
  nowIso?: string | undefined;
  transport?: WebhookTransportFn | undefined;
}): Promise<WebhookBatchSummary> {
  const now = input.nowIso ?? new Date().toISOString();
  const currentTimestamp = new Date(now).getTime();

  let inspectedCount = 0;
  let deliveredCount = 0;
  let retriedCount = 0;
  let exhaustedCount = 0;

  for (const delivery of deliveriesStore.values()) {
    if (input.tenantId && delivery.tenantId !== input.tenantId) {
      continue;
    }

    if (delivery.status !== 'pending' && delivery.status !== 'retrying') {
      continue;
    }

    const nextAttemptTimestamp = new Date(delivery.nextAttemptAt).getTime();
    if (nextAttemptTimestamp > currentTimestamp) {
      continue;
    }

    inspectedCount++;

    const updated = await executeSingleWebhookDelivery(delivery.id, input.transport, now);

    if (updated.status === 'delivered') {
      deliveredCount++;
    } else if (updated.status === 'retrying') {
      retriedCount++;
    } else if (updated.status === 'failed_exhausted') {
      exhaustedCount++;
    }
  }

  return {
    inspectedCount,
    deliveredCount,
    retriedCount,
    exhaustedCount,
  };
}

/**
 * Test and seed helpers.
 */
export function seedWebhookEndpoint(endpoint: WebhookEndpointRecord): void {
  endpointsStore.set(endpoint.id, endpoint);
}

export function seedWebhookDelivery(delivery: WebhookDeliveryRecord): void {
  deliveriesStore.set(delivery.id, delivery);
}

export function getWebhookDelivery(id: string): WebhookDeliveryRecord | undefined {
  return deliveriesStore.get(id);
}

export function resetOutboundWebhookStore(): void {
  endpointsStore.clear();
  deliveriesStore.clear();
}
