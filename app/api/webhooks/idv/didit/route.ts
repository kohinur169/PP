// path: app/api/webhooks/idv/didit/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { DiditAdapter } from '@/lib/idv/didit';
import { applyIdvFailClosedPolicy } from '@/lib/idv/types';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature =
    req.headers.get('x-didit-signature') ??
    req.headers.get('x-didit-signature-sha256') ??
    '';
  const timestamp = req.headers.get('x-didit-timestamp') ?? undefined;

  const adapter = new DiditAdapter();
  const webhookSecret = process.env.DIDIT_API_SECRET ?? 'didit_test_secret';

  const isValid = adapter.verifyWebhookSignature(rawBody, signature, webhookSecret, timestamp);
  if (!isValid) {
    logger.warn('Didit webhook signature or timestamp verification failed', {
      signatureProvided: Boolean(signature),
      hasTimestamp: Boolean(timestamp),
    });
    return NextResponse.json(
      { error: 'Unauthorized: Invalid Didit webhook signature or replay timestamp' },
      { status: 401 }
    );
  }

  try {
    const rawPayload = JSON.parse(rawBody) as Record<string, unknown>;
    const parsedResult = adapter.parseWebhookPayload(rawPayload);
    const enforcement = applyIdvFailClosedPolicy(parsedResult);

    logger.info('Didit IDV webhook processed successfully', {
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
    logger.error('Failed to parse Didit webhook payload', { error: errorMessage });
    return NextResponse.json(
      { error: 'Bad Request: Malformed Didit webhook payload' },
      { status: 400 }
    );
  }
}
