// path: app/api/office/support/kyc-probe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import { assertSupportZeroAccessToKyc } from '@/lib/office/support-engine';

export async function POST(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.SUPPORT;
    const actorRole = roleHeader as Role;

    // Strict architectural isolation check
    assertSupportZeroAccessToKyc(actorRole);

    return NextResponse.json({
      status: 'kyc_approved',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/support-isolation',
        title: 'Forbidden KYC Action',
        status: 403,
        detail: error.message || 'Support role cannot perform KYC decisions',
      },
      { status: 403 }
    );
  }
}
