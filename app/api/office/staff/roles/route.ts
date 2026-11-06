// path: app/api/office/staff/roles/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  delegateStaffRole,
  DelegateStaffRoleInput,
} from '@/lib/office/staff-delegation';
import { UserRepository } from '@/lib/db/users';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export const dynamic = 'force-dynamic';

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance = '/api/office/staff/roles',
  errorCode = 'STAFF_DELEGATION_ERROR'
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
 * Step 066.3 & Step 066.4: POST /api/office/staff/roles
 * Reassigns or delegates office roles to staff members with Step-Up 2FA protection.
 */
export async function POST(
  request: NextRequest | Request,
  options?: {
    readonly userRepo?: UserRepository | undefined;
    readonly auditRepo?: AuditLogRepository | undefined;
  }
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return createProblemResponse(400, 'Malformed Request Body', 'Request body must be valid JSON.');
  }

  const actorId =
    request.headers.get('x-staff-id') ||
    request.headers.get('x-user-id') ||
    (typeof body.actorId === 'string' ? body.actorId : '018f6c4c-3500-7fa1-b1e2-000000000001');

  const actorRoleStr =
    request.headers.get('x-staff-role') ||
    request.headers.get('x-user-role') ||
    (typeof body.actorRole === 'string' ? body.actorRole : Role.SUPER_ADMIN);

  const actorRole = actorRoleStr as Role;

  const stepUpTicket =
    request.headers.get('x-step-up-ticket') ||
    (typeof body.stepUpTicket === 'string' ? body.stepUpTicket : undefined);

  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : '';
  const newRole = typeof body.newRole === 'string' ? (body.newRole as Role) : Role.SUPPORT;
  const reason = typeof body.reason === 'string' ? body.reason : '';

  const input: DelegateStaffRoleInput = {
    targetUserId,
    newRole,
    reason,
  };

  try {
    const result = await delegateStaffRole(input, {
      actorId,
      actorRole,
      stepUpTicket,
      userRepo: options?.userRepo,
      auditRepo: options?.auditRepo,
    });

    if (!result.success && result.challengeRequired) {
      return new Response(
        JSON.stringify({
          type: 'https://kdsolution.it/errors/step-up-required',
          title: 'Step-Up Reauthentication Required',
          status: 428,
          detail: result.challenge.message,
          challenge: result.challenge,
        }),
        {
          status: 428,
          headers: {
            'Content-Type': 'application/problem+json',
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Office role successfully delegated to ${newRole}.`,
        staffMember: 'staffMember' in result ? result.staffMember : undefined,
        oldRole: 'oldRole' in result ? result.oldRole : undefined,
        newRole: 'newRole' in result ? result.newRole : undefined,
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Role delegation failed';
    const status = msg.includes('Access Denied') ? 403 : 400;
    const title = status === 403 ? 'Forbidden' : 'Bad Request';
    return createProblemResponse(status, title, msg);
  }
}
