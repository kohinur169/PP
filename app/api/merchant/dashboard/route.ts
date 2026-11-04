// path: app/api/merchant/dashboard/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import { getMerchantDashboardMetrics } from '@/lib/merchant/dashboard-engine';

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;
    const actorUserId = req.headers.get('x-user-id') || '018f6c4c-3500-7fa1-b1e2-100000000001';
    const companyId =
      req.headers.get('x-company-id') || '018f6c4c-3500-7fa1-b1e2-000000000001';
    const sessionCompanyId = req.headers.get('x-session-company-id') || companyId;

    const metrics = await getMerchantDashboardMetrics({
      companyId,
      actorUserId,
      actorRole,
      sessionCompanyId,
    });

    return NextResponse.json({
      metrics,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/merchant-dashboard',
        title: 'Merchant Analytics Error',
        status,
        detail: error.message || 'Failed to retrieve merchant dashboard metrics',
      },
      { status }
    );
  }
}
