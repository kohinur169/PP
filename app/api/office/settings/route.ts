// path: app/api/office/settings/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  getPlatformSettings,
  updatePlatformSettings,
  UpdatePlatformSettingsInput,
} from '@/lib/office/platform-settings';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Rfc7807ProblemDetails } from '@/lib/validation/types';

export const dynamic = 'force-dynamic';

function createProblemResponse(
  status: number,
  title: string,
  detail: string,
  instance = '/api/office/settings',
  errorCode = 'PLATFORM_SETTINGS_ERROR'
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
 * Step 066.2: GET /api/office/settings
 * Retrieves active global platform settings.
 */
export async function GET(): Promise<Response> {
  try {
    const settings = await getPlatformSettings();
    return NextResponse.json(settings, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve settings';
    return createProblemResponse(500, 'Internal Server Error', msg);
  }
}

/**
 * Step 066.2 & Step 066.4: POST /api/office/settings
 * Updates platform settings. Requires Super Admin role and Step-Up 2FA ticket.
 */
export async function POST(
  request: NextRequest | Request,
  options?: { readonly auditRepo?: AuditLogRepository | undefined }
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

  const updateInput: UpdatePlatformSettingsInput = {
    platformName: typeof body.platformName === 'string' ? body.platformName : undefined,
    logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl : undefined,
    supportEmail: typeof body.supportEmail === 'string' ? body.supportEmail : undefined,
    supportPhone: typeof body.supportPhone === 'string' ? body.supportPhone : undefined,
    defaultFeePercent: typeof body.defaultFeePercent === 'string' ? body.defaultFeePercent : undefined,
    defaultReservePercent: typeof body.defaultReservePercent === 'string' ? body.defaultReservePercent : undefined,
    emergencyKillswitch: typeof body.emergencyKillswitch === 'boolean' ? body.emergencyKillswitch : undefined,
  };

  try {
    const result = await updatePlatformSettings(updateInput, {
      actorId,
      actorRole,
      stepUpTicket,
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
        message: 'Platform settings updated successfully.',
        settings: 'settings' in result ? result.settings : undefined,
      },
      { status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Settings update failed';
    const status = msg.includes('Access Denied') ? 403 : 400;
    const title = status === 403 ? 'Forbidden' : 'Bad Request';
    return createProblemResponse(status, title, msg);
  }
}

export const PUT = POST;
