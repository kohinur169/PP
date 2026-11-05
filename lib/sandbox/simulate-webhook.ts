// path: lib/sandbox/simulate-webhook.ts

import crypto from 'node:crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type SimulatedWebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'dispute.opened'
  | 'refund.processed';

export interface SimulatedWebhookDispatchResult {
  eventId: string;
  eventType: SimulatedWebhookEventType;
  destinationUrl: string;
  signatureHeader: string;
  payload: Record<string, unknown>;
  simulatedHttpStatus: number;
  simulatedResponseMs: number;
  dispatchedAt: string;
}

const auditRepo = new AuditLogRepository();

/**
 * Step 215.2: Generates signed HMAC-SHA256 signature header (`KD-Signature`).
 */
export function generateWebhookSignature(payloadString: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payloadString}`;
  const hmac = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

/**
 * Step 215.2 - 215.4: Simulates webhook event dispatch with cryptographic HMAC-SHA256 signature.
 */
export async function simulateWebhookDispatch(input: {
  companyId: string;
  destinationUrl: string;
  webhookSecret: string;
  eventType: SimulatedWebhookEventType;
  customPayload?: Record<string, unknown> | undefined;
}): Promise<SimulatedWebhookDispatchResult> {
  const eventId = `evt_sim_${generateUuidV7().replace(/-/g, '').slice(0, 20)}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const defaultPayloads: Record<SimulatedWebhookEventType, Record<string, unknown>> = {
    'payment.succeeded': {
      id: `ch_sim_${generateUuidV7().slice(0, 16)}`,
      amount: '120.0000',
      currency: 'USD',
      status: 'succeeded',
      customer_email: 'buyer@example.test',
    },
    'payment.failed': {
      id: `ch_sim_fail_${generateUuidV7().slice(0, 16)}`,
      amount: '75.0000',
      currency: 'USD',
      status: 'failed',
      failure_code: 'card_declined',
    },
    'dispute.opened': {
      id: `dp_sim_${generateUuidV7().slice(0, 16)}`,
      amount: '200.0000',
      currency: 'USD',
      reason: 'fraudulent',
      status: 'needs_response',
    },
    'refund.processed': {
      id: `re_sim_${generateUuidV7().slice(0, 16)}`,
      amount: '50.0000',
      currency: 'USD',
      status: 'succeeded',
    },
  };

  const payloadData = input.customPayload ?? defaultPayloads[input.eventType];
  const fullEnvelope = {
    event_id: eventId,
    event_type: input.eventType,
    is_simulated: true,
    created_at: new Date().toISOString(),
    data: payloadData,
  };

  const payloadString = JSON.stringify(fullEnvelope);
  const signatureHeader = generateWebhookSignature(payloadString, input.webhookSecret, timestamp);

  // Simulated destination server response
  const simulatedHttpStatus = 200;
  const simulatedResponseMs = 45;

  logger.info('Simulated webhook event dispatched to merchant endpoint', {
    companyId: input.companyId,
    eventType: input.eventType,
    destinationUrl: input.destinationUrl,
    eventId,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-0000-0000-000000000000',
      action: 'SIMULATED_WEBHOOK_DISPATCHED',
      entity_type: 'webhook_event',
      entity_id: eventId,
      payload: {
        eventType: input.eventType,
        destinationUrl: input.destinationUrl,
        httpStatus: simulatedHttpStatus,
      },
    });
  } catch {}

  return {
    eventId,
    eventType: input.eventType,
    destinationUrl: input.destinationUrl,
    signatureHeader,
    payload: fullEnvelope,
    simulatedHttpStatus,
    simulatedResponseMs,
    dispatchedAt: new Date().toISOString(),
  };
}
