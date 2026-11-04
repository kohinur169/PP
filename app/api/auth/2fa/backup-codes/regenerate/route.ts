// path: app/api/auth/2fa/backup-codes/regenerate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';
import { UserRepository } from '@/lib/db/users';
import { UserBackupCodesRepository } from '@/lib/db/backup-codes';
import { AuditLogRepository } from '@/lib/db/audit';
import { regenerateBackupCodes } from '@/lib/auth/backup-codes';
import { getAndValidateSession } from '@/lib/auth/session';
import type { DeviceCharacteristics } from '@/lib/auth/session-types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export interface RegenerateRouteDependencies {
  readonly userRepo?: UserRepository | undefined;
  readonly backupRepo?: UserBackupCodesRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly fastHash?: boolean | undefined;
}

const defaultUserRepo = new UserRepository();
const defaultBackupRepo = new UserBackupCodesRepository();
const defaultAuditRepo = new AuditLogRepository();

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

function extractUserId(request: Request): string | null {
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
 * Step 053.4: Regenerates 10 fresh backup recovery codes for the authenticated user,
 * invalidating all previously issued codes.
 */
export async function POST(
  request: NextRequest | Request,
  contextOptions?: RegenerateRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/2fa/backup-codes/regenerate';
  const userRepo = contextOptions?.userRepo ?? defaultUserRepo;
  const backupRepo = contextOptions?.backupRepo ?? defaultBackupRepo;
  const auditRepo = contextOptions?.auditRepo ?? defaultAuditRepo;

  const userId = extractUserId(request);
  if (!userId) {
    logger.warn('Regenerate backup codes rejected: unauthenticated request');
    return createProblemResponse(
      401,
      'Unauthorized',
      'You must be signed in to manage 2FA backup codes.',
      instancePath,
      'UNAUTHORIZED'
    );
  }

  const user = await userRepo.findById(userId);
  if (!user) {
    return createProblemResponse(
      404,
      'User Not Found',
      `Authenticated user with ID "${userId}" was not found.`,
      instancePath,
      'USER_NOT_FOUND'
    );
  }

  try {
    const result = await regenerateBackupCodes(user.id, {
      repo: backupRepo,
      auditRepo,
      companyId: user.company_id,
      fastHash: contextOptions?.fastHash,
    });

    return NextResponse.json(
      {
        success: true,
        plain_codes: result.plainCodes,
        count: result.count,
        generated_at: result.generatedAt,
        message:
          '10 new backup recovery codes generated. All previous backup codes are now permanently invalidated.',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    logger.error('Failed to regenerate backup recovery codes', { userId, error: err });
    return createProblemResponse(
      500,
      'Internal Server Error',
      'Failed to regenerate backup codes. Please retry.',
      instancePath,
      'INTERNAL_ERROR'
    );
  }
}
