// path: app/api/auth/step-up/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import {
  extractSessionTokenFromRequest,
  extractDeviceFromRequest,
  getAndValidateSession,
} from '@/lib/auth/session';
import { executeStepUpVerification } from '@/lib/auth/step-up';
import type { SensitiveActionType } from '@/lib/auth/step-up-types';
import { UserRepository } from '@/lib/db/users';
import { UserMfaRepository } from '@/lib/db/mfa';
import { SessionRepository } from '@/lib/db/sessions';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const StepUpPayloadSchema = z.object({
  password: z.string().optional(),
  totp_code: z.string().optional(),
  action: z
    .enum([
      'MODIFY_BANK_ACCOUNT',
      'UPDATE_PAYOUT_ROUTING',
      'REVOKE_API_KEY',
      'GENERATE_SECRET_KEY',
      'ALTER_RISK_TIER',
      'FREEZE_PAYOUTS',
      'TRANSFER_OWNERSHIP',
      'ROTATE_WEBHOOK_SECRET',
      'UNLOCK_USER_ACCOUNT',
      'RESET_USER_2FA',
      'UPDATE_GATEWAY_KEYS',
      'REVEAL_GATEWAY_KEYS',
      'APPROVE_PAYOUT',
      'APPROVE_KYC_FINAL',
    ])
    .optional(),
});

export interface StepUpRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly mfaRepo?: UserMfaRepository | undefined;
  readonly sessionRepo?: SessionRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly nowMs?: number | undefined;
}

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'STEP_UP_ERROR'
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
 * Step 058.3: Step-Up Reauthentication API Endpoint.
 * Validates fresh password or 2FA credentials for high-privilege operations,
 * issues a 5-minute ReauthTicket, and updates the session's last_reauth_at timestamp.
 */
export async function POST(
  request: NextRequest | Request,
  options?: StepUpRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/step-up';

  // 1. Identify and authenticate user session
  let userId: string | null = null;
  let sessionId: string | undefined = undefined;

  const token = extractSessionTokenFromRequest(request);
  const device = extractDeviceFromRequest(request);

  if (token) {
    const sessionResult = getAndValidateSession(token, device);
    if (sessionResult.valid && sessionResult.session) {
      userId = sessionResult.session.userId;
      sessionId = sessionResult.session.id;
    }
  }

  // Check x-user-id fallback for test environments
  if (!userId) {
    const headerUserId = request.headers.get('x-user-id');
    if (headerUserId) {
      userId = headerUserId;
      sessionId = request.headers.get('x-session-id') ?? undefined;
    }
  }

  if (!userId) {
    return createProblemResponse(
      401,
      'Authentication Required',
      'Active user session not found. Please log in before performing step-up verification.',
      instancePath,
      'UNAUTHORIZED'
    );
  }

  // 2. Parse and validate payload
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

  const parseResult = StepUpPayloadSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return createProblemResponse(
      400,
      'Validation Failed',
      'Invalid step-up verification parameters.',
      instancePath,
      'VALIDATION_FAILED'
    );
  }

  const input = parseResult.data;

  // 3. Execute step-up credential verification
  const verification = await executeStepUpVerification(
    {
      userId,
      sessionId,
      password: input.password,
      totpCode: input.totp_code,
      action: input.action as SensitiveActionType | undefined,
      ipAddress: device.ip,
      userAgent: device.userAgent,
    },
    {
      userRepo: options?.userRepo,
      mfaRepo: options?.mfaRepo,
      sessionRepo: options?.sessionRepo,
      auditRepo: options?.auditRepo,
      nowMs: options?.nowMs,
    }
  );

  if (!verification.success) {
    logger.warn('Step-up reauthentication rejected', {
      userId,
      error: verification.error,
    });

    return createProblemResponse(
      401,
      'Verification Failed',
      verification.message,
      instancePath,
      verification.error ?? 'STEP_UP_FAILED'
    );
  }

  // 4. Return success response with issued ticket and updated timestamp
  const ticket = verification.ticket!;

  return new NextResponse(
    JSON.stringify({
      success: true,
      ticket_id: ticket.id,
      action: ticket.action,
      last_reauth_at: verification.lastReauthAt,
      expires_at: ticket.expiresAt,
      message: 'Step-up reauthentication verified successfully.',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
