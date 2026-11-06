// path: app/api/auth/verify-email/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import { verifyEmailToken } from '@/lib/auth/email-verify';
import { EmailVerificationTokenRepository } from '@/lib/db/email-verify';
import { UserRepository } from '@/lib/db/users';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Injectable dependency options for testing and modular execution.
 */
export interface VerifyEmailRouteDependencies {
  readonly tokenRepo?: EmailVerificationTokenRepository | undefined;
  readonly userRepo?: UserRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

/**
 * Helper to build standard RFC 7807 Problem Details HTTP responses.
 */
function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode: string
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
 * Step 048.3: Handles GET /api/auth/verify-email?token=...
 */
export async function GET(
  request: NextRequest | Request,
  contextOptions?: VerifyEmailRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/verify-email';

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token || token.trim().length === 0) {
      return createProblemResponse(
        400,
        'Missing Verification Token',
        'A valid email verification token is required in the query string.',
        instancePath,
        'MISSING_TOKEN'
      );
    }

    const result = await verifyEmailToken(token.trim(), {
      tokenRepo: contextOptions?.tokenRepo,
      userRepo: contextOptions?.userRepo,
      auditRepo: contextOptions?.auditRepo,
    });

    if (!result.success) {
      const status = result.error === 'USER_NOT_FOUND' ? 404 : 400;
      const title =
        result.error === 'TOKEN_EXPIRED'
          ? 'Verification Token Expired'
          : result.error === 'TOKEN_ALREADY_USED'
          ? 'Token Already Used'
          : result.error === 'USER_NOT_FOUND'
          ? 'User Not Found'
          : 'Invalid Verification Token';

      return createProblemResponse(
        status,
        title,
        result.message,
        instancePath,
        result.error || 'VERIFICATION_FAILED'
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        user_id: result.userId,
        email: result.email,
        status: 'active',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    logger.error('Unexpected error during email verification', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createProblemResponse(
      500,
      'Internal Verification Error',
      'An unexpected error occurred during email verification. Please contact support.',
      instancePath,
      'INTERNAL_SERVER_ERROR'
    );
  }
}

/**
 * Handles POST /api/auth/verify-email with JSON body { "token": "..." }
 */
export async function POST(
  request: NextRequest | Request,
  contextOptions?: VerifyEmailRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/verify-email';

  try {
    let body: { token?: unknown };
    try {
      body = (await request.json()) as { token?: unknown };
    } catch {
      return createProblemResponse(
        400,
        'Malformed JSON Body',
        'Request body must be valid JSON containing a token property.',
        instancePath,
        'MALFORMED_JSON'
      );
    }

    if (!body || typeof body.token !== 'string' || body.token.trim().length === 0) {
      return createProblemResponse(
        400,
        'Missing Verification Token',
        'A valid email verification token is required in the request body.',
        instancePath,
        'MISSING_TOKEN'
      );
    }

    const result = await verifyEmailToken(body.token.trim(), {
      tokenRepo: contextOptions?.tokenRepo,
      userRepo: contextOptions?.userRepo,
      auditRepo: contextOptions?.auditRepo,
    });

    if (!result.success) {
      const status = result.error === 'USER_NOT_FOUND' ? 404 : 400;
      const title =
        result.error === 'TOKEN_EXPIRED'
          ? 'Verification Token Expired'
          : result.error === 'TOKEN_ALREADY_USED'
          ? 'Token Already Used'
          : result.error === 'USER_NOT_FOUND'
          ? 'User Not Found'
          : 'Invalid Verification Token';

      return createProblemResponse(
        status,
        title,
        result.message,
        instancePath,
        result.error || 'VERIFICATION_FAILED'
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
        user_id: result.userId,
        email: result.email,
        status: 'active',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    logger.error('Unexpected error during POST email verification', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createProblemResponse(
      500,
      'Internal Verification Error',
      'An unexpected error occurred during email verification. Please contact support.',
      instancePath,
      'INTERNAL_SERVER_ERROR'
    );
  }
}
