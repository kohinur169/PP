// path: app/api/office/finance/processor-bills/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@/lib/auth/roles';
import { listProcessorBills, verifyProcessorBill } from '@/lib/office/finance-engine';

const verifyProcessorBillSchema = z.object({
  billId: z.string().min(1),
  decision: z.enum(['matched', 'variance_disputed']),
  notes: z.string().min(5),
});

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;

    const bills = await listProcessorBills(actorRole);

    return NextResponse.json({
      bills,
      totalCount: bills.length,
      underReviewCount: bills.filter((b) => b.status === 'under_review').length,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/finance-bills',
        title: 'Processor Bills Error',
        status,
        detail: error.message || 'Failed to list processor bills',
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
    const parsed = verifyProcessorBillSchema.safeParse(body);

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

    const reviewed = await verifyProcessorBill({
      billId: parsed.data.billId,
      decision: parsed.data.decision,
      notes: parsed.data.notes,
      actorId,
      actorRole,
    });

    return NextResponse.json({
      success: true,
      reviewed,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 400;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/finance-bills',
        title: 'Bill Verification Failed',
        status,
        detail: error.message || 'Failed to verify processor bill',
      },
      { status }
    );
  }
}
