// path: app/api/office/staff/[id]/offboard/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@/lib/auth/roles';
import { offboardStaffMember } from '@/lib/office/offboarding';

const offboardSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters long'),
  ticketId: z.string().optional(),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  contextOptions?: { dependencies?: import('@/lib/office/offboarding').OffboardingDependencies }
) {
  try {
    const { id } = await params;
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;
    const actorId = req.headers.get('x-user-id') || '';
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || 'Browser';

    const body = await req.json();
    const parsed = offboardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Offboarding Request',
          status: 400,
          detail: parsed.error.issues[0]?.message || 'Validation failed',
        },
        { status: 400 }
      );
    }

    const result = await offboardStaffMember({
      targetStaffId: id,
      actorId,
      actorRole,
      reason: parsed.data.reason,
      ticketId: parsed.data.ticketId,
      dependencies: contextOptions?.dependencies ?? {
        ipAddress,
        userAgent,
      },
    });

    if (!result.success && result.stepUpRequired) {
      return NextResponse.json(
        {
          success: false,
          stepUpRequired: true,
          challenge: result.challenge,
        },
        { status: 403 }
      );
    }

    const response = NextResponse.json({
      success: true,
      targetStaffId: (result as any).targetStaffId,
      offboardedAt: (result as any).offboardedAt,
      checklist: (result as any).checklist,
    });

    for (const cookieHeader of (result as any).clearCookieHeaders || []) {
      response.headers.append('Set-Cookie', cookieHeader);
    }

    return response;
  } catch (error: any) {
    const isDenied = error.message?.toLowerCase().includes('denied');
    const isNotFound = error.message?.includes('not found');
    const status = isDenied ? 403 : isNotFound ? 404 : 400;

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/staff-offboarding',
        title: 'Offboarding Failed',
        status,
        detail: error.message || 'Failed to offboard staff member',
      },
      { status }
    );
  }
}
