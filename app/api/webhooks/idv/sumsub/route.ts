// path: app/api/webhooks/idv/sumsub/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { SumsubAdapter } from '@/lib/idv/sumsub';
import { applyIdvFailClosedPolicy } from '@/lib/idv/types';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature =
    req.headers.get('x-payload-digest') ??
    req.headers.get('x-payload-digest-sha256') ??
    '';
  const digestAlg =
    (req.headers.get('x-payload-digest-alg') as 'sha256' | 'sha1') ?? 'sha256';

  const adapter = new SumsubAdapter();
  const webhookSecret = process.env.SUMSUB_SECRET_KEY ?? 'sumsub_test_secret_key';

  const isValid = adapter.verifyWebhookSignature(rawBody, signature, webhookSecret, digestAlg);
  if (!isValid) {
    logger.warn('Sumsub webhook signature verification failed', {
      signatureProvided: Boolean(signature),
      digestAlg,
    });
    return NextResponse.json(
      { error: 'Unauthorized: Invalid Sumsub webhook payload digest' },
      { status: 401 }
    );
  }

  try {
    const rawPayload = JSON.parse(rawBody) as Record<string, unknown>;
    const parsedResult = adapter.parseWebhookPayload(rawPayload);
    const enforcement = applyIdvFailClosedPolicy(parsedResult);

    logger.info('Sumsub IDV webhook processed successfully', {
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
    logger.error('Failed to parse Sumsub webhook payload', { error: errorMessage });
    return NextResponse.json(
      { error: 'Bad Request: Malformed Sumsub webhook payload' },
      { status: 400 }
    );
  }
}
