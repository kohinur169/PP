// path: app/api/auth/logout/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  extractSessionTokenFromRequest,
  extractDeviceFromRequest,
  getAndValidateSession,
} from '@/lib/auth/session';
import { logout } from '@/lib/auth/session-kill';
import { SessionRepository } from '@/lib/db/sessions';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export interface LogoutRouteDependencies {
  readonly sessionRepo?: SessionRepository | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}

/**
 * Step 059.1: Single-session logout API endpoint.
 * Terminates the active session record in memory and database,
 * emits an immutable audit event, and sets expired Set-Cookie headers.
 */
export async function POST(
  request: NextRequest | Request,
  options?: LogoutRouteDependencies
): Promise<Response> {
  const token = extractSessionTokenFromRequest(request);
  const device = extractDeviceFromRequest(request);

  let sessionId: string | null = null;
  let userId: string | undefined = undefined;

  if (token) {
    const validation = getAndValidateSession(token, device);
    if (validation.session) {
      sessionId = validation.session.id;
      userId = validation.session.userId;
    }
  }

  // Also check header override for programmatic calls
  if (!sessionId) {
    const headerSessionId = request.headers.get('x-session-id');
    if (headerSessionId) {
      sessionId = headerSessionId;
    }
  }

  if (!userId) {
    const headerUserId = request.headers.get('x-user-id');
    if (headerUserId) {
      userId = headerUserId;
    }
  }

  const result = await logout(sessionId, {
    sessionRepo: options?.sessionRepo,
    auditRepo: options?.auditRepo,
    userId,
    ipAddress: device.ip,
    userAgent: device.userAgent,
    reason: 'USER_LOGOUT',
  });

  const response = NextResponse.json(
    {
      success: true,
      message: result.message,
    },
    { status: 200 }
  );

  // Set explicit cookie clearing headers
  for (const cookieHeader of result.clearCookieHeaders) {
    response.headers.append('Set-Cookie', cookieHeader);
  }

  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  logger.info('Logout completed', {
    sessionId: result.sessionId,
    userId,
  });

  return response;
}
