// path: app/api/webhooks/idv/jumio/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { JumioAdapter } from '@/lib/idv/jumio';
import { applyIdvFailClosedPolicy } from '@/lib/idv/types';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature =
    req.headers.get('x-jumio-signature') ??
    req.headers.get('x-jumio-signature-sha256') ??
    '';

  const adapter = new JumioAdapter();
  const webhookSecret = process.env.JUMIO_API_SECRET ?? 'jumio_test_secret';

  const isValid = adapter.verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    logger.warn('Jumio webhook signature verification failed', {
      signatureProvided: Boolean(signature),
    });
    return NextResponse.json(
      { error: 'Unauthorized: Invalid Jumio webhook HMAC signature' },
      { status: 401 }
    );
  }

  try {
    const rawPayload = JSON.parse(rawBody) as Record<string, unknown>;
    const parsedResult = adapter.parseWebhookPayload(rawPayload);
    const enforcement = applyIdvFailClosedPolicy(parsedResult);

    logger.info('Jumio IDV webhook processed successfully', {
      sessionId: parsedResult.sessionId,
      vendorStatus: parsedResult.status,
      enforcedStatus: enforcement.finalStatus,
      confidenceScore: parsedResult.confidenceScore,
      livenessPassed: parsedResult.livenessPassed,
    });

    return NextResponse.json({
      received: true,
      sessionId: parsedResult.sessionId,
      status: enforcement.finalStatus,
      isApproved: enforcement.isApproved,
      requiresManualReview: enforcement.requiresManualReview,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown parsing error';
    logger.error('Failed to parse Jumio webhook payload', { error: errorMessage });
    return NextResponse.json(
      { error: 'Bad Request: Malformed webhook payload' },
      { status: 400 }
    );
  }
}
