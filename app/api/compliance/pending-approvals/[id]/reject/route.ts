// path: app/api/compliance/pending-approvals/[id]/reject/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { rejectHighRiskProposal } from '@/lib/compliance/four-eye';

export const dynamic = 'force-dynamic';

/**
 * Step 063.3: API endpoint for rejecting a pending high-risk proposal.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const proposalId = params.id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid JSON request body.' },
      { status: 400 }
    );
  }

  const approverId = (body.approver_id as string) ?? request.headers.get('x-user-id');
  const approverRole = (body.approver_role as string) ?? request.headers.get('x-user-role') ?? request.headers.get('x-staff-role');
  const rejectionReason = body.rejection_reason as string;

  if (!approverId || !approverRole || !rejectionReason) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'approver_id, approver_role, and rejection_reason are mandatory.' },
      { status: 400 }
    );
  }

  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || 'Unknown';

  try {
    const updated = await rejectHighRiskProposal({
      proposalId,
      approverId,
      approverRole,
      rejectionReason,
      clientIp,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: 'Proposal rejected successfully.',
      data: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rejection failed.';
    return NextResponse.json(
      { error: 'Rejection Failed', message },
      { status: 400 }
    );
  }
}
