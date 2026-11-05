// path: lib/webhooks/signatures/airwallex.ts

import crypto from 'node:crypto';
import type { WebhookSignatureResult } from './stripe';

/**
 * Cryptographically verifies Airwallex webhook HMAC-SHA256 signatures.
 * Supports both standalone body hashing and timestamp-prefixed HMAC.
 */
export async function verifyAirwallexWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  options?: { timestampHeader?: string | undefined; toleranceSeconds?: number | undefined }
): Promise<WebhookSignatureResult> {
  if (!signatureHeader || !signatureHeader.trim()) {
    return { isValid: false, failureReason: 'Missing Airwallex signature header.' };
  }

  if (!secret || !secret.trim()) {
    return { isValid: false, failureReason: 'Missing Airwallex webhook secret.' };
  }

  try {
    const tolerance = options?.toleranceSeconds ?? 300;
    const timestampStr = options?.timestampHeader;

    if (timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      if (!Number.isNaN(timestamp)) {
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - timestamp) > tolerance) {
          return {
            isValid: false,
            failureReason: `Airwallex webhook timestamp outside tolerance window (${tolerance}s).`,
          };
        }
      }
    }

    // Attempt direct body HMAC and timestamp-prefixed HMAC
    const expectedSigDirect = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const expectedSigWithTime = timestampStr
      ? crypto
          .createHmac('sha256', secret)
          .update(`${timestampStr}${rawBody}`, 'utf8')
          .digest('hex')
      : null;

    const receivedBuffer = Buffer.from(signatureHeader.trim(), 'hex');
    const directBuffer = Buffer.from(expectedSigDirect, 'hex');

    let isValid = false;
    if (
      directBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(directBuffer, receivedBuffer)
    ) {
      isValid = true;
    } else if (expectedSigWithTime) {
      const timeBuffer = Buffer.from(expectedSigWithTime, 'hex');
      if (
        timeBuffer.length === receivedBuffer.length &&
        crypto.timingSafeEqual(timeBuffer, receivedBuffer)
      ) {
        isValid = true;
      }
    }

    if (!isValid) {
      return { isValid: false, failureReason: 'Airwallex signature verification failed.' };
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      // Ignored
    }

    const eventType = typeof parsed['name'] === 'string' ? parsed['name'] : 'unknown';
    const providerEventId = typeof parsed['id'] === 'string' ? parsed['id'] : undefined;

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
