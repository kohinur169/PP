// path: app/api/compliance/pending-approvals/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  proposeHighRiskAction,
  getPendingProposals,
  formatDiffForDisplay,
} from '@/lib/compliance/four-eye';
import { extractRoleFromRequest } from '@/lib/auth/guard';
import { Role } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * Step 063.3: API endpoint for querying and proposing high-risk actions.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const role = extractRoleFromRequest(request);

  if (!role || (role !== Role.SUPER_ADMIN && role !== Role.CEO && role !== Role.COMPLIANCE_KYC && role !== Role.FINANCE_OPS)) {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Insufficient permissions to view approval proposals.' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId') ?? undefined;

  const proposals = await getPendingProposals(companyId);

  const formatted = proposals.map((p) => ({
    ...p,
    formatted_diff: formatDiffForDisplay(p.diff_summary),
  }));

  return NextResponse.json({
    success: true,
    count: formatted.length,
    data: formatted,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid JSON request body.' },
      { status: 400 }
    );
  }

  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || 'Unknown';

  try {
    const proposal = await proposeHighRiskAction(
      {
        company_id: body.company_id as string | undefined,
        action_type: body.action_type as any,
        target_id: body.target_id as string | undefined,
        current_state: (body.current_state as Record<string, unknown>) ?? {},
        proposed_payload: (body.proposed_payload as Record<string, unknown>) ?? {},
        initiator_id: body.initiator_id as string,
        initiator_role: body.initiator_role as string,
        initiator_notes: body.initiator_notes as string | undefined,
        clientIp,
        userAgent,
      }
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          ...proposal,
          formatted_diff: formatDiffForDisplay(proposal.diff_summary),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create approval proposal.';
    return NextResponse.json(
      { error: 'Proposal Failed', message: msg },
      { status: 400 }
    );
  }
}
