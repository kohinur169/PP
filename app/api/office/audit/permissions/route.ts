// path: app/api/office/audit/permissions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  logPermissionChange,
  getPermissionChangeAuditEntries,
  PermissionChangeAuditEntry,
} from '@/lib/audit/rbac';

export const dynamic = 'force-dynamic';

function getClientIp(req: NextRequest | Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/**
 * Step 075.1: GET /api/office/audit/permissions
 * Retrieves permission elevation, role delegation, and transition audit logs.
 * Restricted to Super Admin, CEO, and Compliance KYC roles.
 */
export async function GET(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';

  const actorRole = roleHeader as Role;

  const authorizedRoles: Role[] = [Role.SUPER_ADMIN, Role.CEO, Role.COMPLIANCE_KYC];
  if (!authorizedRoles.includes(actorRole)) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Only executive staff and compliance officers can view permission audit logs.',
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url, 'http://localhost');
  const targetUserId = url.searchParams.get('targetUserId') || undefined;
  const actorId = url.searchParams.get('actorId') || undefined;
  const roleFilter = url.searchParams.get('role') || undefined;

  let entries = getPermissionChangeAuditEntries({ targetUserId, actorId });

  if (roleFilter) {
    entries = entries.filter(
      (e) => e.newRole === roleFilter || e.oldRole === roleFilter
    );
  }

  return NextResponse.json(
    {
      success: true,
      count: entries.length,
      entries,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

/**
 * Step 075.1: POST /api/office/audit/permissions
 * Records a permission or role transition with cryptographic audit logging and alerts.
 * Restricted to Super Admin.
 */
export async function POST(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';

  const actorId =
    req.headers.get('x-user-id') ||
    req.headers.get('x-staff-id') ||
    '';

  const actorRole = roleHeader as Role;

  if (actorRole !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Only Super Admin can record or alter staff permissions.',
      },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as {
      targetUserId?: unknown;
      oldRole?: unknown;
      newRole?: unknown;
      reason?: unknown;
    };

    if (
      typeof body.targetUserId !== 'string' ||
      typeof body.oldRole !== 'string' ||
      typeof body.newRole !== 'string' ||
      typeof body.reason !== 'string'
    ) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Request Payload',
          status: 400,
          detail: 'targetUserId, oldRole, newRole, and reason are required string fields.',
        },
        { status: 400 }
      );
    }

    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || 'Internal-Audit-Route/1.0';

    const entry = await logPermissionChange(
      actorId || '018f6c4c-3500-7fa1-b1e2-000000000001',
      body.targetUserId,
      body.oldRole,
      body.newRole,
      body.reason,
      {
        ipAddress,
        userAgent,
      }
    );

    return NextResponse.json(
      {
        success: true,
        entry,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Permission Audit Error',
        status: 400,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }
}
