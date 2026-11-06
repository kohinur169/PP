// path: lib/webhooks/signatures/payoneer.ts

import crypto from 'node:crypto';
import type { WebhookSignatureResult } from './stripe';

/**
 * Cryptographically verifies Payoneer webhook signatures.
 * Supports HMAC-SHA256 digest and bearer verification token comparison.
 */
export async function verifyPayoneerWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<WebhookSignatureResult> {
  if (!signatureHeader || !signatureHeader.trim()) {
    return { isValid: false, failureReason: 'Missing Payoneer webhook signature or authorization token.' };
  }

  if (!secret || !secret.trim()) {
    return { isValid: false, failureReason: 'Missing Payoneer webhook secret.' };
  }

  try {
    const cleanReceived = signatureHeader.replace(/^Bearer\s+/i, '').trim();

    // 1. Direct HMAC-SHA256 signature verification
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    const receivedBuffer = Buffer.from(cleanReceived, 'hex');

    let isValid = false;

    if (
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      isValid = true;
    } else {
      // 2. Fallback: Fixed webhook verification token comparison
      const secretBuffer = Buffer.from(secret, 'utf8');
      const tokenBuffer = Buffer.from(cleanReceived, 'utf8');

      if (
        secretBuffer.length === tokenBuffer.length &&
        crypto.timingSafeEqual(secretBuffer, tokenBuffer)
      ) {
        isValid = true;
      }
    }

    if (!isValid) {
      return { isValid: false, failureReason: 'Payoneer webhook signature verification failed.' };
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
        : typeof parsed['type'] === 'string'
          ? parsed['type']
          : 'payout.notification';

    const providerEventId =
      typeof parsed['payout_id'] === 'string'
        ? parsed['payout_id']
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
