// path: app/api/office/finance/reconciliation/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@/lib/auth/roles';
import {
  listReconciliationMismatches,
  resolveReconciliationMismatch,
  calculateRemainingSla,
} from '@/lib/office/finance-engine';

const resolveMismatchSchema = z.object({
  mismatchId: z.string().min(1),
  resolutionType: z.enum(['ADJUSTMENT_POSTED', 'PROCESSOR_REVERSED', 'TIMING_DIFFERENCE']),
  resolutionNotes: z.string().min(5),
});

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;

    const mismatches = await listReconciliationMismatches(actorRole);

    const enriched = mismatches.map((m) => {
      const sla = calculateRemainingSla(m.detectedAt);
      return {
        ...m,
        slaRemainingHours: sla.remainingHours,
        slaRemainingMinutes: sla.remainingMinutes,
        slaBreached: sla.isBreached,
      };
    });

    return NextResponse.json({
      mismatches: enriched,
      totalCount: enriched.length,
      pendingCount: enriched.filter((m) => m.status === 'pending_resolution').length,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/finance-reconciliation',
        title: 'Reconciliation Error',
        status,
        detail: error.message || 'Failed to list reconciliation mismatches',
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
    const parsed = resolveMismatchSchema.safeParse(body);

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

    const resolved = await resolveReconciliationMismatch({
      mismatchId: parsed.data.mismatchId,
      resolutionType: parsed.data.resolutionType,
      resolutionNotes: parsed.data.resolutionNotes,
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
        type: 'https://kdsolution.it/errors/finance-reconciliation',
        title: 'Resolution Failed',
        status,
        detail: error.message || 'Failed to resolve reconciliation mismatch',
      },
      { status }
    );
  }
}
