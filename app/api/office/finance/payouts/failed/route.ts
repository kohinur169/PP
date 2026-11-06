// path: app/api/office/finance/payouts/failed/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@/lib/auth/roles';
import { listFailedPayouts, resolveFailedPayout } from '@/lib/office/finance-engine';

const resolveFailedPayoutSchema = z.object({
  failedPayoutId: z.string().min(1),
  action: z.enum([
    'RETRY_DISBURSEMENT',
    'HOLD_FOR_MERCHANT_BANK_UPDATE',
    'RETURN_TO_MERCHANT_BALANCE',
  ]),
  notes: z.string().min(5),
});

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;

    const failedPayouts = await listFailedPayouts(actorRole);

    return NextResponse.json({
      failedPayouts,
      totalCount: failedPayouts.length,
      pendingCount: failedPayouts.filter((p) => p.status === 'pending_investigation').length,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/finance-payouts',
        title: 'Payout Investigation Error',
        status,
        detail: error.message || 'Failed to list failed payouts',
      },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorId = req.headers.get('x-user-id') || '018f6c4c-3500-7fa1-b1e2-300000000003';
    const actorRole = roleHeader as Role;

    const body = await req.json();
    const parsed = resolveFailedPayoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Request Payload',
          status: 400,
          detail: parsed.error.issues[0]?.message || 'Validation failed',
        },
        { status: 400 }
      );
    }

    const resolved = await resolveFailedPayout({
      failedPayoutId: parsed.data.failedPayoutId,
      action: parsed.data.action,
      notes: parsed.data.notes,
      actorId,
      actorRole,
    });

    return NextResponse.json({
      success: true,
      resolved,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 400;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/finance-payouts',
        title: 'Payout Action Failed',
        status,
        detail: error.message || 'Failed to process failed payout action',
      },
      { status }
    );
  }
}
