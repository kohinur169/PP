// path: app/api/office/compliance-officer/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  getPublicComplianceOfficerDisclosure,
  proposeComplianceOfficerAppointment,
  approveComplianceOfficerAppointment,
  ComplianceOfficerRepository,
} from '@/lib/compliance/officer';

export const dynamic = 'force-dynamic';

const officerRepo = new ComplianceOfficerRepository();

/**
 * Step 078.3: GET /api/office/compliance-officer
 * Returns active compliance officer details and pending approvals.
 */
export async function GET(req: NextRequest | Request) {
  const disclosure = await getPublicComplianceOfficerDisclosure(officerRepo);
  const active = await officerRepo.getActiveOfficer();
  const pending = await officerRepo.getPendingAppointment();

  return NextResponse.json(
    {
      success: true,
      disclosure,
      activeOfficer: active,
      pendingAppointment: pending,
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
 * Step 078.2: POST /api/office/compliance-officer
 * Proposes (Super Admin) or Approves (CEO) compliance officer appointments.
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

  try {
    const body = (await req.json()) as {
      action?: 'propose' | 'approve';
      officerName?: string;
      officialEmail?: string;
      regulatorRegistrationNumber?: string;
      contactPhone?: string;
      jurisdiction?: string;
      justification?: string;
      appointmentId?: string;
      approvalNotes?: string;
    };

    if (body.action === 'propose') {
      if (actorRole !== Role.SUPER_ADMIN) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/forbidden',
            title: 'Access Denied',
            status: 403,
            detail: 'Only Super Admin can propose an updated Compliance Officer appointment.',
          },
          { status: 403 }
        );
      }

      if (
        !body.officerName ||
        !body.officialEmail ||
        !body.regulatorRegistrationNumber ||
        !body.contactPhone ||
        !body.justification
      ) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/validation',
            title: 'Missing Required Fields',
            status: 400,
            detail: 'officerName, officialEmail, regulatorRegistrationNumber, contactPhone, and justification are required.',
          },
          { status: 400 }
        );
      }

      const record = await proposeComplianceOfficerAppointment(
        {
          officerName: body.officerName,
          officialEmail: body.officialEmail,
          regulatorRegistrationNumber: body.regulatorRegistrationNumber,
          contactPhone: body.contactPhone,
          jurisdiction: body.jurisdiction,
          appointedBy: actorId || '018f6c4c-3500-7fa1-b1e2-000000000001',
          actorRole,
          justification: body.justification,
        },
        { repo: officerRepo }
      );

      return NextResponse.json(
        {
          success: true,
          message: 'Compliance Officer appointment proposal submitted. Awaiting CEO confirmation.',
          appointment: record,
        },
        { status: 201 }
      );
    } else if (body.action === 'approve') {
      if (actorRole !== Role.CEO) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/forbidden',
            title: 'Access Denied',
            status: 403,
            detail: 'Only CEO can approve and confirm Compliance Officer appointments.',
          },
          { status: 403 }
        );
      }

      if (!body.appointmentId) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/validation',
            title: 'Missing Appointment ID',
            status: 400,
            detail: 'appointmentId is required to approve appointment.',
          },
          { status: 400 }
        );
      }

      const active = await approveComplianceOfficerAppointment(
        {
          appointmentId: body.appointmentId,
          ceoUserId: actorId || '018f6c4c-3500-7fa1-b1e2-100000000001',
          ceoRole: actorRole,
          approvalNotes: body.approvalNotes,
        },
        { repo: officerRepo }
      );

      return NextResponse.json(
        {
          success: true,
          message: 'Compliance Officer appointment confirmed and active platform-wide.',
          appointment: active,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Invalid Action',
        status: 400,
        detail: 'Action must be "propose" or "approve".',
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Compliance Officer Error',
        status: 400,
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }
}
