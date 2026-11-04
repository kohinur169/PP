// path: app/api/compliance/pending-approvals/[id]/approve/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { approveHighRiskProposal } from '@/lib/compliance/four-eye';

export const dynamic = 'force-dynamic';

/**
 * Step 063.2 & Step 063.3: API endpoint for approving a pending high-risk proposal.
 * Strictly verifies the Four-Eye Principle: initiator !== approver.
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
  const approvalNotes = body.approval_notes as string | undefined;

  if (!approverId || !approverRole) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'approver_id and approver_role are mandatory.' },
      { status: 400 }
    );
  }

  const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || 'Unknown';

  try {
    const updated = await approveHighRiskProposal({
      proposalId,
      approverId,
      approverRole,
      approvalNotes,
      clientIp,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      message: 'Proposal approved and executed successfully under dual control.',
      data: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Approval failed.';
    const isDualControlViolation = message.includes('Dual-control violation');

    return NextResponse.json(
      {
        error: isDualControlViolation ? 'Dual Control Violation' : 'Approval Rejected',
        message,
      },
      { status: isDualControlViolation ? 403 : 400 }
    );
  }
}
