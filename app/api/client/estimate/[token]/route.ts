// path: app/api/client/estimate/[token]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyEstimateToken, acceptAndSignEstimate } from '@/lib/client-portal/tokens';

const signEstimateSchema = z.object({
  signatureDataUrl: z.string().min(10),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const clientIp = getClientIp(req);
  try {
    const { token } = await params;
    const estimate = await verifyEstimateToken(token, clientIp);

    return NextResponse.json({
      estimate,
    });
  } catch (error: any) {
    const isRateLimit = error.message?.includes('Too Many Requests');
    const isNotFound = error.message?.includes('not found') || error.message?.includes('expired');
    const status = isRateLimit ? 429 : isNotFound ? 404 : 400;

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/client-estimate',
        title: isRateLimit ? 'Too Many Requests' : 'Estimate Access Error',
        status,
        detail: error.message || 'Failed to retrieve estimate',
      },
      { status }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const clientIp = getClientIp(req);
  try {
    const { token } = await params;
    const body = await req.json();
    const parsed = signEstimateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Signature Payload',
          status: 400,
          detail: parsed.error.issues[0]?.message || 'Validation failed',
        },
        { status: 400 }
      );
    }

    const signed = await acceptAndSignEstimate({
      token,
      signatureDataUrl: parsed.data.signatureDataUrl,
      clientIp,
    });

    return NextResponse.json({
      success: true,
      estimate: signed,
    });
  } catch (error: any) {
    const isRateLimit = error.message?.includes('Too Many Requests');
    const status = isRateLimit ? 429 : 400;

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/client-estimate-signature',
        title: isRateLimit ? 'Too Many Requests' : 'Signature Failed',
        status,
        detail: error.message || 'Failed to sign and accept estimate',
      },
      { status }
    );
  }
}
