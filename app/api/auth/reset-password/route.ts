// path: app/api/auth/reset-password/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { executePasswordReset } from '@/lib/auth/password-reset';
import { ResetPasswordRequestSchema } from '@/types/password-reset';
import { extractDeviceFromRequest } from '@/lib/auth/session';
import { UserRepository } from '@/lib/db/users';
import { PasswordResetTokenRepository } from '@/lib/db/password-reset';
import { SessionRepository } from '@/lib/db/sessions';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export interface ResetPasswordRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly resetRepo?: PasswordResetTokenRepository | undefined;
  readonly sessionRepo?: SessionRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly nowMs?: number | undefined;
}

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'RESET_PASSWORD_ERROR'
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
 * Step 060.4: Reset Password API Endpoint.
 * Validates reset token, checks lockout immunity guard, updates password hash,
 * invalidates token, and revokes all active sessions across all devices.
 */
export async function POST(
  request: NextRequest | Request,
  options?: ResetPasswordRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/reset-password';
  const device = extractDeviceFromRequest(request);

  // 1. Parse and validate JSON request body
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

  const parseResult = ResetPasswordRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return createProblemResponse(
      400,
      'Validation Failed',
      parseResult.error.issues[0]?.message ?? 'Invalid password reset parameters.',
      instancePath,
      'VALIDATION_FAILED'
    );
  }

  const input = parseResult.data;

  // 2. Execute password reset
  const result = await executePasswordReset(
    {
      token: input.token,
      password: input.password,
      turnstileToken: input.turnstile_token,
      ipAddress: device.ip,
      userAgent: device.userAgent,
    },
    {
      userRepo: options?.userRepo,
      resetRepo: options?.resetRepo,
      sessionRepo: options?.sessionRepo,
      auditRepo: options?.auditRepo,
      nowMs: options?.nowMs,
    }
  );

  if (!result.success) {
    const status =
      result.error === 'ACCOUNT_LOCKED'
        ? 403
        : result.error === 'WEAK_PASSWORD' || result.error === 'PWNED_PASSWORD'
          ? 422
          : 400;

    return createProblemResponse(
      status,
      result.error === 'ACCOUNT_LOCKED'
        ? 'Account Locked'
        : result.error === 'TOKEN_EXPIRED'
          ? 'Token Expired'
          : result.error === 'TOKEN_ALREADY_USED'
            ? 'Token Already Used'
            : 'Password Reset Failed',
      result.message,
      instancePath,
      result.error ?? 'RESET_FAILED'
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: result.message,
      user_id: result.userId,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
