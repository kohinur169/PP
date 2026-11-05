// path: app/api/office/gateways/[provider]/test/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  testGatewayConnection,
  isValidProviderSlug,
  VALID_PROVIDER_SLUGS,
} from '@/lib/processors/test-connection';
import { logger } from '@/lib/logger/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await params;

  if (!isValidProviderSlug(provider)) {
    return NextResponse.json(
      {
        error: `Invalid gateway provider: '${provider}'. Valid options: ${VALID_PROVIDER_SLUGS.join(', ')}`,
      },
      { status: 400 }
    );
  }

  let credentials: Record<string, string> | undefined;
  try {
    const body = (await req.json()) as { credentials?: Record<string, string> };
    if (body && typeof body.credentials === 'object') {
      credentials = body.credentials;
    }
  } catch {
    // Body is optional; fallback to configured environment / stored credentials
  }

  logger.info('Executing gateway connection test via office API', {
    provider,
    customCredentials: Boolean(credentials),
  });

  const report = await testGatewayConnection({
    providerSlug: provider,
    credentials,
  });

  if (!report.isConnected) {
    return NextResponse.json(report, { status: 422 });
  }

  return NextResponse.json(report, { status: 200 });
}
