// path: app/api/office/2fa-reset/[id]/approve/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import {
  approveOffice2faReset,
  Office2faResetOptions,
} from '@/lib/office/2fa-reset';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'OFFICE_ERROR'
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
 * Step 054.2: Staff API endpoint to authorize 2FA reset for a merchant.
 */
export async function POST(
  request: NextRequest | Request,
  context: { params: { id: string } },
  contextOptions?: Office2faResetOptions
): Promise<Response> {
  const requestId = context.params.id;
  const instancePath = `/api/office/2fa-reset/${requestId}/approve`;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return createProblemResponse(
      400,
      'Malformed Request Body',
      'Request body must be valid JSON.',
      instancePath,
      'INVALID_JSON'
    );
  }

  const body = (typeof rawBody === 'object' && rawBody !== null ? rawBody : {}) as Record<string, unknown>;

  const staffActorId =
    (request.headers.get('x-staff-id') || (body['staffActorId'] as string) || '').trim();
  const staffRole =
    (request.headers.get('x-staff-role') || (body['staffRole'] as string) || '').trim();
  const isSuperadmin =
    request.headers.get('x-is-superadmin') === 'true' || body['isSuperadmin'] === true;
  const ticketId =
    (request.headers.get('x-step-up-ticket') || (body['ticketId'] as string) || '').trim();
  const notes = typeof body['notes'] === 'string' ? body['notes'] : undefined;

  if (!staffActorId || !staffRole) {
    logger.warn('Office 2FA reset approval rejected: missing staff identity headers', {
      requestId,
    });
    return createProblemResponse(
      401,
      'Unauthorized',
      'Valid staff identity headers are required to authorize 2FA resets.',
      instancePath,
      'UNAUTHORIZED'
    );
  }

  const result = await approveOffice2faReset(
    {
      requestId,
      staffActorId,
      staffRole,
      isSuperadmin,
      ticketId: ticketId || undefined,
      notes,
    },
    contextOptions
  );

  if (!result.success) {
    if (result.error === 'STEP_UP_REQUIRED') {
      return new Response(
        JSON.stringify({
          type: 'https://kdsolution.it/errors/step-up-required',
          title: 'Step-Up Reauthentication Required',
          status: 428,
          detail: result.message,
          instance: instancePath,
          challengeRequired: true,
          action: 'RESET_USER_2FA',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 428,
          headers: {
            'Content-Type': 'application/problem+json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      );
    }

    if (result.error === 'FORBIDDEN') {
      return createProblemResponse(403, 'Forbidden', result.message, instancePath, 'FORBIDDEN');
    }

    if (result.error === 'REQUEST_NOT_FOUND' || result.error === 'USER_NOT_FOUND') {
      return createProblemResponse(404, 'Not Found', result.message, instancePath, 'NOT_FOUND');
    }

    return createProblemResponse(400, 'Bad Request', result.message, instancePath, result.error);
  }

  return NextResponse.json(
    {
      success: true,
      message: result.message,
      request_id: requestId,
      approved_at: result.request?.approved_at,
      user_id: result.user?.id,
      must_setup_2fa: result.user?.must_setup_2fa,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
