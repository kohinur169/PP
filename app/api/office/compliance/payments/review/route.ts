// path: app/api/office/compliance/payments/review/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  listFlaggedPayments,
  decidePaymentReview,
} from '@/lib/office/compliance-engine';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export const dynamic = 'force-dynamic';

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance = '/api/office/compliance/payments/review',
  errorCode = 'PAYMENT_REVIEW_ERROR'
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
 * Step 068.3: GET /api/office/compliance/payments/review
 * Lists flagged payments requiring manual compliance review (> $5k or AVS mismatch).
 */
export async function GET(request: NextRequest | Request): Promise<Response> {
  const actorRoleStr =
    request.headers.get('x-staff-role') ||
    request.headers.get('x-user-role') ||
    Role.COMPLIANCE_KYC;

  const actorRole = actorRoleStr as Role;

  try {
    const list = await listFlaggedPayments(actorRole);
    return NextResponse.json({ items: list }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Access Denied';
    return createProblemResponse(403, 'Forbidden', msg);
  }
}

/**
 * Step 068.3: POST /api/office/compliance/payments/review
 * Decides a flagged payment review (releasing funds or cancelling as fraud).
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

  const paymentReviewId = typeof body.paymentReviewId === 'string' ? body.paymentReviewId : '';
  const decision = body.decision === 'cancel_fraud' ? 'cancel_fraud' : 'release';
  const notes = typeof body.notes === 'string' ? body.notes : 'Manually reviewed by compliance officer.';

  try {
    const item = await decidePaymentReview({
      paymentReviewId,
      officerId,
      officerRole,
      decision,
      notes,
      auditRepo: options?.auditRepo,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Payment review resolved: funds ${decision === 'release' ? 'released' : 'cancelled as fraud'}.`,
        item,
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Decision failed';
    const status = msg.includes('Access Denied') ? 403 : msg.includes('not found') ? 404 : 400;
    const title = status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : 'Bad Request';
    return createProblemResponse(status, title, msg);
  }
}
