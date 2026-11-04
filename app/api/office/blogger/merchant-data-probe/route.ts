// path: app/api/office/blogger/merchant-data-probe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  assertBloggerZeroAccessToMerchantData,
  assertBloggerZeroAccessToFinancials,
} from '@/lib/office/blogger-engine';

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.BLOGGER;
    const resource = req.nextUrl.searchParams.get('resource') || 'companies';
    const actorRole = roleHeader as Role;

    if (resource === 'financials') {
      assertBloggerZeroAccessToFinancials(actorRole);
    } else {
      assertBloggerZeroAccessToMerchantData(actorRole, resource);
    }

    return NextResponse.json({
      status: 'accessible',
      resource,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/blogger-isolation',
        title: 'Forbidden Data Access',
        status: 403,
        detail: error.message || 'Blogger role cannot access merchant data',
      },
      { status: 403 }
    );
  }
}
