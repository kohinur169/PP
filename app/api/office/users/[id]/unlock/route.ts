// path: app/api/office/users/[id]/unlock/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import {
  unlockUserAccountByOffice,
  MANDATORY_CONTACT_CONFIRMATION_STATEMENT,
} from '@/lib/office/unlock';
import { UserRepository } from '@/lib/db/users';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface RouteContext {
  readonly params: Promise<{ readonly id: string }> | { readonly id: string };
}

/**
 * Injectable dependency options for testing and modular execution.
 */
export interface OfficeUnlockRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly bypassStepUp?: boolean | undefined;
}

/**
 * Creates an RFC 7807 standard Problem Details HTTP Response.
 */
function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'OFFICE_UNLOCK_ERROR'
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
 * Step 051.1: POST /api/office/users/[id]/unlock
 * Requires:
 * - Staff actor authorized role (compliance_kyc or super_admin)
 * - Ephemeral Step-Up Reauthentication Ticket ('UNLOCK_USER_ACCOUNT')
 * - Step 051.2: Mandatory confirmed contact checkbox
 * - Justification reason (min 10 characters)
 */
export async function POST(
  request: NextRequest | Request,
  context: RouteContext,
  contextOptions?: OfficeUnlockRouteDependencies
): Promise<Response> {
  const resolvedParams = await Promise.resolve(context?.params);
  const targetUserId = resolvedParams?.id;
  const instancePath = `/api/office/users/${targetUserId}/unlock`;

  if (!targetUserId || targetUserId.trim().length === 0) {
    return createProblemResponse(
      400,
      'Missing User Identifier',
      'A valid target user UUID is required in the route path.',
      instancePath,
      'INVALID_USER_ID'
    );
  }

  // Parse request body
  let body: {
    contact_confirmed?: unknown;
    reason?: unknown;
    ticket_id?: unknown;
    staff_id?: unknown;
    staff_role?: unknown;
    is_superadmin?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return createProblemResponse(
      400,
      'Malformed Request Body',
      'Request body must be valid JSON.',
      instancePath,
      'MALFORMED_JSON'
    );
  }

  // Extract staff context from headers or body
  const staffActorId =
    request.headers.get('x-staff-id') ||
    (typeof body.staff_id === 'string' ? body.staff_id : '') ||
    '018f6c4c-3500-7fa1-b1e2-900000000001'; // Default office staff actor

  const staffRole =
    request.headers.get('x-staff-role') ||
    (typeof body.staff_role === 'string' ? body.staff_role : '') ||
    'compliance_kyc';

  const isSuperadmin =
    request.headers.get('x-is-superadmin') === 'true' ||
    body.is_superadmin === true ||
    staffRole === 'super_admin';

  const ticketId =
    request.headers.get('x-step-up-ticket') ||
    (typeof body.ticket_id === 'string' ? body.ticket_id : undefined);

  const contactConfirmed = body.contact_confirmed === true;
  const reason = typeof body.reason === 'string' ? body.reason : '';

  try {
    const result = await unlockUserAccountByOffice(
      {
        targetUserId,
        staffActorId,
        staffRole,
        isSuperadmin,
        contactConfirmed,
        reason,
        ticketId,
      },
      {
        userRepo: contextOptions?.userRepo,
        auditRepo: contextOptions?.auditRepo,
        bypassStepUp: contextOptions?.bypassStepUp,
      }
    );

    if (!result.success) {
      const status =
        result.error === 'FORBIDDEN'
          ? 403
          : result.error === 'USER_NOT_FOUND'
          ? 404
          : result.error === 'STEP_UP_REQUIRED'
          ? 428 // Precondition Required
          : 400;

      const title =
        result.error === 'FORBIDDEN'
          ? 'Forbidden - Insufficient Staff Role'
          : result.error === 'CONTACT_NOT_CONFIRMED'
          ? 'Mandatory Contact Confirmation Required'
          : result.error === 'STEP_UP_REQUIRED'
          ? 'Step-Up Reauthentication Required'
          : result.error === 'USER_NOT_LOCKED'
          ? 'Account Is Not Locked'
          : result.error === 'USER_NOT_FOUND'
          ? 'User Not Found'
          : 'Unlock Request Failed';

      return createProblemResponse(
        status,
        title,
        result.message,
        instancePath,
        result.error || 'UNLOCK_FAILED'
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        user_id: result.userId,
        unlocked_at: result.unlockedAt,
        confirmation_statement: MANDATORY_CONTACT_CONFIRMATION_STATEMENT,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    logger.error('Unexpected error during office account unlock', {
      targetUserId,
      error: error instanceof Error ? error.message : String(error),
    });

    return createProblemResponse(
      500,
      'Internal Server Error',
      'An unexpected error occurred while processing the account unlock.',
      instancePath,
      'INTERNAL_SERVER_ERROR'
    );
  }
}
