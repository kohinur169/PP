// path: app/api/compliance/terms/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  recordTermsAcceptance,
  getUnacceptedPolicies,
  getAllActivePolicies,
  hasAcceptedLatestTerms,
} from '@/lib/compliance/terms';

export const dynamic = 'force-dynamic';

function getClientIp(req: NextRequest | Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * Step 076.2: GET /api/compliance/terms
 * Checks unaccepted mandatory policies for authenticated user.
 */
export async function GET(req: NextRequest | Request) {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/unauthorized',
        title: 'Authentication Required',
        status: 401,
        detail: 'Authentication is required to query terms acceptance status.',
      },
      { status: 401 }
    );
  }

  const unaccepted = await getUnacceptedPolicies(userId);

  return NextResponse.json(
    {
      success: true,
      hasPendingTerms: unaccepted.length > 0,
      unacceptedCount: unaccepted.length,
      unacceptedPolicies: unaccepted,
      allPolicies: getAllActivePolicies(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

/**
 * Step 076.2: POST /api/compliance/terms
 * Records acceptance of mandatory policies with client IP, user agent, version, and document hash.
 */
export async function POST(req: NextRequest | Request) {
  const userId = req.headers.get('x-user-id');
  const companyId = req.headers.get('x-company-id') || '00000000-0000-7000-8000-000000000000';

  if (!userId) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/unauthorized',
        title: 'Authentication Required',
        status: 401,
        detail: 'Authentication is required to record terms acceptance.',
      },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as {
      policySlug?: unknown;
      policySlugs?: unknown;
    };

    const slugsToAccept: string[] = [];
    if (typeof body.policySlug === 'string') {
      slugsToAccept.push(body.policySlug);
    } else if (Array.isArray(body.policySlugs)) {
      for (const s of body.policySlugs) {
        if (typeof s === 'string') slugsToAccept.push(s);
      }
    }

    if (slugsToAccept.length === 0) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Request',
          status: 400,
          detail: 'At least one policy slug is required.',
        },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || 'Browser-Agent/1.0';

    const recorded = [];
    for (const slug of slugsToAccept) {
      const acceptance = await recordTermsAcceptance(userId, slug, ip, userAgent, {
        companyId,
      });
      recorded.push(acceptance);
    }

    return NextResponse.json(
      {
        success: true,
        acceptedCount: recorded.length,
        acceptances: recorded,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Terms Acceptance Error',
        status: 400,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }
}
