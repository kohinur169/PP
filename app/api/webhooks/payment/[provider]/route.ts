// path: app/api/webhooks/payment/[provider]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import {
  normalizeProviderSlug,
  extractSignatureHeader,
  verifyIncomingWebhook,
  enqueueWebhookEvent,
  type WebhookEventEnvelope,
} from '@/lib/webhooks/dispatcher';

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
): Promise<NextResponse> {
  const rawProvider = params.provider;
  const provider = normalizeProviderSlug(rawProvider);

  if (!provider) {
    logger.warn('Webhook received with invalid or unsupported provider slug', {
      rawProvider,
    });
    return NextResponse.json(
      { error: `Invalid or unsupported payment provider slug: '${rawProvider}'` },
      { status: 400 }
    );
  }

  // Step 126.2: Read raw request body buffer before any JSON parsing to allow precise cryptographic HMAC verification
  const rawBody = await req.text();
  const signature = extractSignatureHeader(provider, req.headers);

  // Step 126.3 & Step 127: Cryptographically verify signature
  const verification = await verifyIncomingWebhook({
    provider,
    rawBody,
    signature,
  });

  if (!verification.isValid) {
    logger.warn('Incoming payment provider webhook signature verification rejected', {
      provider,
      reason: verification.failureReason,
    });
    return NextResponse.json(
      { error: 'Invalid webhook cryptographic signature', reason: verification.failureReason },
      { status: 401 }
    );
  }

  const envelope: WebhookEventEnvelope = {
    id: generateUuidV7(),
    provider,
    eventType: verification.eventType,
    providerEventId: verification.providerEventId,
    rawBody,
    headers: Object.fromEntries(req.headers.entries()),
    parsedPayload: verification.parsedPayload,
    status: 'queued',
    receivedAt: new Date().toISOString(),
  };

  // Step 126.3: Enqueue verified event for asynchronous processing
  await enqueueWebhookEvent(envelope);

  // Step 126.4: Return HTTP 202/200 within 2 seconds to prevent provider webhook delivery retries
  return NextResponse.json(
    {
      received: true,
      eventId: envelope.id,
      eventType: envelope.eventType,
      provider,
    },
    { status: 202 }
  );
}
