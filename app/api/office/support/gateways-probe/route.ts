// path: app/api/office/support/gateways-probe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import { assertSupportZeroAccessToGateways } from '@/lib/office/support-engine';

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.SUPPORT;
    const actorRole = roleHeader as Role;

    // Strict architectural isolation check
    assertSupportZeroAccessToGateways(actorRole);

    return NextResponse.json({
      status: 'accessible',
      gateways: ['nmi', 'payoneer', 'rainforest', 'stripe_connect', 'airwallex'],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/support-isolation',
        title: 'Forbidden Gateway Access',
        status: 403,
        detail: error.message || 'Support role cannot access gateway credentials',
      },
      { status: 403 }
    );
  }
}
