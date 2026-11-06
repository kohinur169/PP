// path: lib/webhooks/signatures/stripe.ts

import crypto from 'node:crypto';
import Stripe from 'stripe';

export interface WebhookSignatureResult {
  isValid: boolean;
  failureReason?: string | undefined;
  eventType?: string | undefined;
  providerEventId?: string | undefined;
  parsedPayload?: Record<string, unknown> | undefined;
  timestamp?: number | undefined;
}

/**
 * Cryptographically verifies Stripe webhook signatures with timestamp replay protection.
 * Format of Stripe-Signature: t=1600000000,v1=abcdef...,v0=...
 */
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300
): Promise<WebhookSignatureResult> {
  if (!signatureHeader || !signatureHeader.trim()) {
    return { isValid: false, failureReason: 'Missing Stripe-Signature header.' };
  }

  if (!secret || !secret.trim()) {
    return { isValid: false, failureReason: 'Missing Stripe webhook secret.' };
  }

  try {
    // Parse key-value pairs from header (e.g. t=timestamp, v1=signature)
    const elements = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, item) => {
      const [key, value] = item.trim().split('=');
      if (key && value) {
        if (!acc[key]) acc[key] = [];
        acc[key].push(value);
      }
      return acc;
    }, {});

    const timestampStr = elements['t']?.[0];
    const signatures = elements['v1'] ?? [];

    if (!timestampStr || signatures.length === 0) {
      return {
        isValid: false,
        failureReason: 'Malformed Stripe-Signature header: missing timestamp or v1 signature.',
      };
    }

    const timestamp = parseInt(timestampStr, 10);
    if (Number.isNaN(timestamp)) {
      return { isValid: false, failureReason: 'Invalid timestamp in Stripe-Signature.' };
    }

    // Step 127.4: Replay attack guard (default 300 seconds / 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return {
        isValid: false,
        failureReason: `Timestamp outside the tolerance zone (${toleranceSeconds}s). Possible replay attack.`,
        timestamp,
      };
    }

    // Compute expected HMAC-SHA256 over `${timestamp}.${rawBody}`
    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    let matched = false;
    for (const sig of signatures) {
      const candidateBuffer = Buffer.from(sig, 'hex');
      if (
        candidateBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
      ) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return { isValid: false, failureReason: 'No signatures matched the expected HMAC-SHA256 signature.' };
    }

    // Parse verified payload safely
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      // Ignored: valid signature with non-JSON body
    }

    return {
      isValid: true,
      eventType: typeof parsed['type'] === 'string' ? parsed['type'] : 'unknown',
      providerEventId: typeof parsed['id'] === 'string' ? parsed['id'] : undefined,
      parsedPayload: parsed,
      timestamp,
    };
  } catch (err: unknown) {
    return {
      isValid: false,
      failureReason: err instanceof Error ? err.message : String(err),
    };
  }
}
