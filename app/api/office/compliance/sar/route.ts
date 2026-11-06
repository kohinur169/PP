// path: app/api/office/compliance/sar/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  listSarCases,
  createSarCase,
  updateSarFilingStatus,
} from '@/lib/office/compliance-engine';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export const dynamic = 'force-dynamic';

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance = '/api/office/compliance/sar',
  errorCode = 'SAR_CASE_ERROR'
): Response {
  const problem: Rfc7807ProblemDetails = {
    type: `https://kdsolution.it/errors/${errorCode.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    detail,
    instance,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(problem), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * Step 068.4: GET /api/office/compliance/sar
 * Lists confidential SAR workspace cases.
 * Strictly forbidden for non-compliance staff.
 */
export async function GET(request: NextRequest | Request): Promise<Response> {
  const actorRoleStr =
    request.headers.get('x-staff-role') ||
    request.headers.get('x-user-role') ||
    Role.COMPLIANCE_KYC;

  const actorRole = actorRoleStr as Role;

  try {
    const cases = await listSarCases(actorRole);
    return NextResponse.json({ items: cases }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Access Denied: Confidential SAR records restricted.';
    return createProblemResponse(403, 'Forbidden', msg);
  }
}

/**
 * Step 068.4: POST /api/office/compliance/sar
 * Drafts a confidential SAR filing or updates FinCEN filing status.
 */
export async function POST(
  request: NextRequest | Request,
  options?: { readonly auditRepo?: AuditLogRepository | undefined }
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return createProblemResponse(400, 'Malformed Request Body', 'Request body must be valid JSON.');
  }

  const officerId =
    request.headers.get('x-staff-id') ||
    request.headers.get('x-user-id') ||
    (typeof body.officerId === 'string' ? body.officerId : '018f6c4c-3500-7fa1-b1e2-200000000002');

  const officerRoleStr =
    request.headers.get('x-staff-role') ||
    request.headers.get('x-user-role') ||
    (typeof body.officerRole === 'string' ? body.officerRole : Role.COMPLIANCE_KYC);

  const officerRole = officerRoleStr as Role;

  const action = typeof body.action === 'string' ? body.action : 'create';

  try {
    if (action === 'update_status') {
      const sarId = typeof body.sarId === 'string' ? body.sarId : '';
      const status = (typeof body.status === 'string' ? body.status : 'draft') as
        | 'draft'
        | 'ready_for_filing'
        | 'filed_with_fincen';

      const updated = await updateSarFilingStatus({
        sarId,
        status,
        officerId,
        officerRole,
        auditRepo: options?.auditRepo,
      });

      return NextResponse.json(
        {
          success: true,
          message: `SAR filing status updated to ${status}.`,
          sarCase: updated,
        },
        { status: 200 }
      );
    }

    // Default: create SAR case
    const companyId = typeof body.companyId === 'string' ? body.companyId : '';
    const subjectName = typeof body.subjectName === 'string' ? body.subjectName : '';
    const suspectedActivity = (typeof body.suspectedActivity === 'string' ? body.suspectedActivity : 'MONEY_LAUNDERING') as
      | 'STRUCTURING'
      | 'TERROR_FINANCING'
      | 'MONEY_LAUNDERING'
      | 'IDENTITY_THEFT'
      | 'SANCTIONS_EVASION';
    const narrative = typeof body.narrative === 'string' ? body.narrative : '';
    const totalSuspiciousAmountUsd = typeof body.totalSuspiciousAmountUsd === 'number' ? body.totalSuspiciousAmountUsd : 0;

    const sarCase = await createSarCase({
      companyId,
      subjectName,
      suspectedActivity,
      narrative,
      totalSuspiciousAmountUsd,
      officerId,
      officerRole,
      auditRepo: options?.auditRepo,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Confidential SAR case drafted successfully.',
        sarCase,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'SAR operation failed';
    const status = msg.includes('Access Denied') ? 403 : 400;
    const title = status === 403 ? 'Forbidden' : 'Bad Request';
    return createProblemResponse(status, title, msg);
  }
}
