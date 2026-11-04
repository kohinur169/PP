// path: app/api/auth/2fa/backup-codes/consume/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import { UserRepository } from '@/lib/db/users';
import { UserBackupCodesRepository } from '@/lib/db/backup-codes';
import { AuditLogRepository } from '@/lib/db/audit';
import { verifyAndConsumeBackupCode } from '@/lib/auth/backup-codes';
import { getAndValidateSession } from '@/lib/auth/session';
import type { DeviceCharacteristics } from '@/lib/auth/session-types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface ConsumeRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly backupRepo?: UserBackupCodesRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

const defaultUserRepo = new UserRepository();
const defaultBackupRepo = new UserBackupCodesRepository();
const defaultAuditRepo = new AuditLogRepository();

const ConsumeCodeSchema = z.object({
  user_id: z.string().uuid().optional(),
  code: z.string().min(6).max(20),
});

/**
 * Creates an RFC 7807 standard Problem Details HTTP Response.
 */
function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'AUTHENTICATION_ERROR'
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

function extractClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim().length > 0) return cfIp.trim();

  const xff = request.headers.get('x-forwarded-for');
  if (xff && xff.trim().length > 0) {
    const first = xff.split(',')[0];
    if (first && first.trim().length > 0) return first.trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) return realIp.trim();

  return '127.0.0.1';
}

function extractUserId(request: Request, bodyUserId?: string): string | null {
  // If user_id provided in body (e.g. during 2FA challenge login phase)
  if (bodyUserId && bodyUserId.trim().length > 0) {
    return bodyUserId.trim();
  }

  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId && headerUserId.trim().length > 0) {
    return headerUserId.trim();
  }

  let token: string | null = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/kd_session=([^;]+)/);
      if (match && match[1]) {
        token = decodeURIComponent(match[1]);
      }
    }
  }

  if (token) {
    const device: DeviceCharacteristics = {
      ip: extractClientIp(request),
      userAgent: request.headers.get('user-agent') || 'Unknown User-Agent',
      acceptLanguage: request.headers.get('accept-language') || 'en-US',
    };

    const sessionResult = getAndValidateSession(token, device);
    if (sessionResult.valid && sessionResult.session) {
      return sessionResult.session.userId;
    }
  }

  return null;
}

/**
 * Step 053.3: Consumes a single-use backup recovery code.
 * Validates the submitted code against argon2id hashes in user_backup_codes,
 * marks used in database, and prevents replay attacks.
 */
export async function POST(
  request: NextRequest | Request,
  contextOptions?: ConsumeRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/2fa/backup-codes/consume';
  const userRepo = contextOptions?.userRepo ?? defaultUserRepo;
  const backupRepo = contextOptions?.backupRepo ?? defaultBackupRepo;
  const auditRepo = contextOptions?.auditRepo ?? defaultAuditRepo;

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

  const parseResult = ConsumeCodeSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return createProblemResponse(
      400,
      'Validation Failed',
      'Please provide a valid backup recovery code.',
      instancePath,
      'VALIDATION_FAILED'
    );
  }

  const { user_id: bodyUserId, code } = parseResult.data;
  const userId = extractUserId(request, bodyUserId);

  if (!userId) {
    logger.warn('Consume backup code rejected: unauthenticated request');
    return createProblemResponse(
      401,
      'Unauthorized',
      'Authentication or valid user ID required to consume backup code.',
      instancePath,
      'UNAUTHORIZED'
    );
  }

  const user = await userRepo.findById(userId);
  if (!user) {
    return createProblemResponse(
      404,
      'User Not Found',
      `Target user with ID "${userId}" was not found.`,
      instancePath,
      'USER_NOT_FOUND'
    );
  }

  // Attempt consumption
  const result = await verifyAndConsumeBackupCode(user.id, code, {
    repo: backupRepo,
    auditRepo,
  });

  if (!result.valid) {
    logger.warn('Backup recovery code consumption failed', {
      userId: user.id,
      error: result.error,
    });

    return createProblemResponse(
      400,
      'Invalid Recovery Code',
      result.error ?? 'Invalid or already consumed backup recovery code.',
      instancePath,
      'INVALID_CODE'
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: 'Backup recovery code verified and consumed successfully.',
      code_id: result.codeId,
      remaining_count: result.remainingCount,
      consumed_at: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
