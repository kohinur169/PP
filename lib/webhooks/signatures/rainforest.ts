// path: lib/webhooks/signatures/rainforest.ts

import crypto from 'node:crypto';
import type { WebhookSignatureResult } from './stripe';

/**
 * Cryptographically verifies Rainforest Payments webhook HMAC-SHA256 signatures.
 */
export async function verifyRainforestWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<WebhookSignatureResult> {
  if (!signatureHeader || !signatureHeader.trim()) {
    return { isValid: false, failureReason: 'Missing Rainforest webhook signature header.' };
  }

  if (!secret || !secret.trim()) {
    return { isValid: false, failureReason: 'Missing Rainforest webhook secret.' };
  }

  try {
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    const receivedBuffer = Buffer.from(signatureHeader.trim(), 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return { isValid: false, failureReason: 'Rainforest signature verification failed.' };
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      // Ignored
    }

    const eventType = typeof parsed['event_type'] === 'string' ? parsed['event_type'] : 'unknown';
    const providerEventId =
      typeof parsed['event_id'] === 'string'
        ? parsed['event_id']
        : typeof parsed['id'] === 'string'
          ? parsed['id']
          : undefined;

    return {
      isValid: true,
      eventType,
      providerEventId,
      parsedPayload: parsed,
    };
  } catch (err: unknown) {
    return {
      isValid: false,
      failureReason: err instanceof Error ? err.message : String(err),
    };
  }
}
