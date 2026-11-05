// path: lib/webhooks/signatures/nmi.ts

import crypto from 'node:crypto';
import type { WebhookSignatureResult } from './stripe';

/**
 * Cryptographically verifies NMI (Network Merchants) webhook HMAC signatures.
 * Performs constant-time comparison against timing attacks.
 */
export async function verifyNmiWebhook(
  rawBody: string,
  signatureHeader: string,
  secretKey: string
): Promise<WebhookSignatureResult> {
  if (!signatureHeader || !signatureHeader.trim()) {
    return { isValid: false, failureReason: 'Missing NMI webhook signature header.' };
  }

  if (!secretKey || !secretKey.trim()) {
    return { isValid: false, failureReason: 'Missing NMI webhook secret key.' };
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(rawBody, 'utf8')
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const receivedBuffer = Buffer.from(signatureHeader.trim(), 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return { isValid: false, failureReason: 'NMI signature verification failed.' };
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      // Ignored
    }

    const eventType =
      typeof parsed['event_type'] === 'string'
        ? parsed['event_type']
        : typeof parsed['action'] === 'string'
          ? parsed['action']
          : 'unknown';

    const providerEventId =
      typeof parsed['transaction_id'] === 'string'
        ? parsed['transaction_id']
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
