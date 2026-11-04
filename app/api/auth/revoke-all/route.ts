// path: app/api/auth/revoke-all/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  extractSessionTokenFromRequest,
  extractDeviceFromRequest,
  getAndValidateSession,
} from '@/lib/auth/session';
import { revokeAllSessions } from '@/lib/auth/session-kill';
import { SessionRepository } from '@/lib/db/sessions';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export interface RevokeAllRouteDependencies {
  readonly sessionRepo?: SessionRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
  readonly nowMs?: number | undefined;
}

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance: string,
  errorCode = 'REVOCATION_ERROR'
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
 * Step 059.2: Global Account Session Revocation API Endpoint (Kill-Switch).
 * Terminates all active logins immediately across all devices, browsers, and IP subnets.
 */
export async function POST(
  request: NextRequest | Request,
  options?: RevokeAllRouteDependencies
): Promise<Response> {
  const instancePath = '/api/auth/revoke-all';
  const token = extractSessionTokenFromRequest(request);
  const device = extractDeviceFromRequest(request);

  let userId: string | null = null;
  let actorId: string | undefined = undefined;

  if (token) {
    const validation = getAndValidateSession(token, device);
    if (validation.valid && validation.session) {
      userId = validation.session.userId;
      actorId = validation.session.userId;
    }
  }

  // Fallback to x-user-id header for administrative calls or testing
  if (!userId) {
    const headerUserId = request.headers.get('x-user-id');
    if (headerUserId) {
      userId = headerUserId;
      actorId = request.headers.get('x-actor-id') ?? headerUserId;
    }
  }

  if (!userId) {
    return createProblemResponse(
      401,
      'Authentication Required',
      'Active session or valid identity required to trigger global session revocation.',
      instancePath,
      'UNAUTHORIZED'
    );
  }

  // Parse optional reason from request body
  let reason = 'USER_KILL_SWITCH';
  try {
    const body = (await request.json()) as { reason?: string } | null;
    if (body?.reason && typeof body.reason === 'string') {
      reason = body.reason.trim();
    }
  } catch {
    // Body is optional; continue with default reason
  }

  const result = await revokeAllSessions(userId, {
    sessionRepo: options?.sessionRepo,
    auditRepo: options?.auditRepo,
    actorId,
    ipAddress: device.ip,
    userAgent: device.userAgent,
    reason,
    nowMs: options?.nowMs,
  });

  const response = NextResponse.json(
    {
      success: true,
      user_id: result.userId,
      revoked_count: result.revokedCount,
      revoked_at: result.revokedAt,
      reason: result.reason,
      message: result.message,
    },
    { status: 200 }
  );

  // Set explicit cookie clearing headers
  for (const cookieHeader of result.clearCookieHeaders) {
    response.headers.append('Set-Cookie', cookieHeader);
  }

  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  logger.warn('Global session kill-switch executed via API', {
    userId,
    actorId,
    revokedCount: result.revokedCount,
    reason,
  });

  return response;
}
