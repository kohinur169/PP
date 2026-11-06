// path: app/api/office/compliance/calendar/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  ComplianceCalendarRepository,
  processComplianceCalendarAlerts,
  calculateDaysRemaining,
  evaluateEventUrgency,
  markEventRenewed,
} from '@/lib/compliance/calendar';

export const dynamic = 'force-dynamic';

const calendarRepo = new ComplianceCalendarRepository();

/**
 * Step 079.2: GET /api/office/compliance/calendar
 * Returns compliance renewal tracker events with days remaining and urgency ratings.
 */
export async function GET(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';

  const actorRole = roleHeader as Role;
  const authorizedRoles: Role[] = [Role.COMPLIANCE_KYC, Role.SUPER_ADMIN, Role.CEO];

  if (!authorizedRoles.includes(actorRole)) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Only Compliance KYC, Super Admin, and CEO can view the compliance calendar.',
      },
      { status: 403 }
    );
  }

  const events = await calendarRepo.getUpcomingDeadlines();
  const now = new Date();

  const enriched = events.map((e) => {
    const daysRemaining = calculateDaysRemaining(e.expiry_date, now);
    const urgency = evaluateEventUrgency(daysRemaining);
    return {
      ...e,
      daysRemaining,
      urgency,
    };
  });

  return NextResponse.json(
    {
      success: true,
      count: enriched.length,
      events: enriched,
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
 * Step 079.3: POST /api/office/compliance/calendar
 * Triggers background check or renewal updates.
 */
export async function POST(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';
  const actorId =
    req.headers.get('x-user-id') ||
    req.headers.get('x-staff-id') ||
    '018f6c4c-3500-7fa1-b1e2-000000000001';

  const actorRole = roleHeader as Role;
  const authorizedRoles: Role[] = [Role.COMPLIANCE_KYC, Role.SUPER_ADMIN, Role.CEO];

  if (!authorizedRoles.includes(actorRole)) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Only authorized compliance office staff can perform calendar actions.',
      },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as {
      action?: 'process_alerts' | 'renew';
      eventId?: string;
      newExpiryDate?: string;
      notes?: string;
      evidenceFileId?: string;
    };

    if (body.action === 'process_alerts') {
      const result = await processComplianceCalendarAlerts({ repo: calendarRepo });
      return NextResponse.json({ success: true, result });
    }

    if (body.action === 'renew') {
      if (!body.eventId || !body.newExpiryDate) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/validation',
            title: 'Missing Fields',
            status: 400,
            detail: 'eventId and newExpiryDate are required for renewal.',
          },
          { status: 400 }
        );
      }

      const renewed = await markEventRenewed(
        {
          eventId: body.eventId,
          newExpiryDate: body.newExpiryDate,
          evidenceFileId: body.evidenceFileId,
          notes: body.notes,
          actorId,
        },
        { repo: calendarRepo }
      );

      return NextResponse.json({ success: true, event: renewed });
    }

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Invalid Action',
        status: 400,
        detail: 'Action must be "process_alerts" or "renew".',
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Calendar Action Error',
        status: 400,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }
}
