// path: app/api/office/ceo/kyc-approvals/[id]/approve/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import { executeCeoFinalKycApproval, UpstreamProcessorKybStatus } from '@/lib/compliance/ceo-approval';
import { KycReviewCase } from '@/lib/compliance/review';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      totpCode?: string;
      tenantId?: string;
      ceoUserId?: string;
      actorRole?: string;
      complianceReviewCase?: KycReviewCase;
      upstreamProcessorKybStatus?: UpstreamProcessorKybStatus;
      policyVersion?: string;
    };

    const companyId = params.id;
    const tenantId = body.tenantId ?? req.headers.get('x-tenant-id') ?? '018f6c4c-3500-7fa1-b1e2-123456789abc';
    const ceoUserId = body.ceoUserId ?? req.headers.get('x-user-id') ?? '018f6c4c-3500-7fa1-b1e2-100000000001';
    const actorRole = (body.actorRole ?? Role.CEO) as Role;
    const totpCode = body.totpCode ?? '';
    const upstreamProcessorKybStatus = body.upstreamProcessorKybStatus ?? 'verified';

    // Mock/default compliance case if not explicitly supplied in request payload
    const complianceReviewCase: KycReviewCase = body.complianceReviewCase ?? {
      id: `kyc_case_${companyId}`,
      tenantId,
      companyId,
      riskLevel: 'standard',
      requiresFourEyes: false,
      firstReviewerId: 'officer_elena_01',
      firstReviewerDecision: 'approved',
      firstReviewerNotes: 'Compliance requirements satisfied and verified.',
      overallStatus: 'ready_for_ceo_approval',
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const approvalResult = executeCeoFinalKycApproval({
      tenantId,
      companyId,
      ceoUserId,
      actorRole,
      totpCode,
      complianceReviewCase,
      upstreamProcessorKybStatus,
      policyVersion: body.policyVersion,
    });

    return NextResponse.json(
      {
        success: true,
        approvalId: approvalResult.approvalId,
        companyId: approvalResult.companyId,
        companyStatus: approvalResult.companyStatus,
        provisioningJobId: approvalResult.provisioningJob.jobId,
        targetGateways: approvalResult.provisioningJob.targetGateways,
        approvedAt: approvalResult.approvedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown approval error';
    const status = message.includes('Unauthorized')
      ? 403
      : message.includes('Security Exception')
      ? 401
      : 422;

    return NextResponse.json({ error: message }, { status });
  }
}
