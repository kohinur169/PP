// path: app/api/office/ceo/approvals/kyc/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  executeCeoKycSignOff,
  rejectCeoKyc,
  getKycPacketById,
} from '@/lib/office/ceo-approvals';
import { CompanyRepository } from '@/lib/db/companies';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export const dynamic = 'force-dynamic';

export interface RouteContext {
  readonly params: Promise<{ readonly id: string }> | { readonly id: string };
}

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'CEO_APPROVAL_ERROR'
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
 * Step 067.2 & Step 067.4: GET /api/office/ceo/approvals/kyc/[id]
 * Retrieves specific KYC packet details for CEO review.
 */
export async function GET(
  _request: NextRequest | Request,
  context: RouteContext
): Promise<Response> {
  const resolvedParams = await Promise.resolve(context?.params);
  const packetId = resolvedParams?.id;
  const instance = `/api/office/ceo/approvals/kyc/${packetId}`;

  const packet = await getKycPacketById(packetId);
  if (!packet) {
    return createProblemResponse(404, 'Packet Not Found', `KYC packet "${packetId}" not found.`, instance);
  }

  return NextResponse.json(packet, { status: 200 });
}

/**
 * Step 067.2 & Step 067.4: POST /api/office/ceo/approvals/kyc/[id]
 * Executes CEO final executive sign-off with Ed25519 signature or rejection.
 */
export async function POST(
  request: NextRequest | Request,
  context: RouteContext,
  options?: {
    readonly companyRepo?: CompanyRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<Response> {
  const resolvedParams = await Promise.resolve(context?.params);
  const packetId = resolvedParams?.id;
  const instance = `/api/office/ceo/approvals/kyc/${packetId}`;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Empty body is permissible for default sign-off
  }

  const actorId =
    request.headers.get('x-staff-id') ||
    request.headers.get('x-user-id') ||
    (typeof body.actorId === 'string' ? body.actorId : '018f6c4c-3500-7fa1-b1e2-200000000001');

  const actorRoleStr =
    request.headers.get('x-staff-role') ||
    request.headers.get('x-user-role') ||
    (typeof body.actorRole === 'string' ? body.actorRole : Role.CEO);

  const actorRole = actorRoleStr as Role;

  const action = typeof body.action === 'string' ? body.action : 'approve';
  const notes = typeof body.notes === 'string' ? body.notes : undefined;
  const reason = typeof body.reason === 'string' ? body.reason : 'Rejected by executive oversight.';

  try {
    if (action === 'reject') {
      const packet = await rejectCeoKyc({
        packetId,
        actorId,
        actorRole,
        reason,
        auditRepo: options?.auditRepo,
      });

      return NextResponse.json(
        {
          success: true,
          action: 'reject',
          message: 'KYC application rejected by CEO.',
          packet,
        },
        { status: 200 }
      );
    }

    const result = await executeCeoKycSignOff({
      packetId,
      actorId,
      actorRole,
      notes,
      companyRepo: options?.companyRepo,
      auditRepo: options?.auditRepo,
    });

    return NextResponse.json(
      {
        success: true,
        action: 'approve',
        message: 'CEO digital sign-off completed with Ed25519 signature. Sub-merchant provisioning unlocked.',
        packet: result.packet,
        signature: result.signature,
        decisionHash: result.decisionHash,
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'CEO approval execution failed';
    const status = msg.includes('Access Denied') ? 403 : msg.includes('not found') ? 404 : 400;
    const title = status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : 'Bad Request';
    return createProblemResponse(status, title, msg, instance);
  }
}
