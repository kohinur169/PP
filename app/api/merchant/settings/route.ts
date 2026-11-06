// path: app/api/merchant/settings/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@/lib/auth/roles';
import { getMerchantSettings, updateMerchantSettings } from '@/lib/merchant/dashboard-engine';

const updateSettingsSchema = z.object({
  legalName: z.string().optional(),
  dbaName: z.string().optional(),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().optional(),
  statementDescriptor: z.string().max(22).optional(),
  payoutSchedule: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;
    const actorUserId = req.headers.get('x-user-id') || '018f6c4c-3500-7fa1-b1e2-100000000001';
    const companyId =
      req.headers.get('x-company-id') || '018f6c4c-3500-7fa1-b1e2-000000000001';
    const sessionCompanyId = req.headers.get('x-session-company-id') || companyId;

    const settings = await getMerchantSettings({
      companyId,
      actorUserId,
      actorRole,
      sessionCompanyId,
    });

    return NextResponse.json({
      settings,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied')
      ? 403
      : error.message?.includes('not found')
      ? 404
      : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/merchant-settings',
        title: 'Settings Retrieval Error',
        status,
        detail: error.message || 'Failed to retrieve company settings',
      },
      { status }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;
    const actorUserId = req.headers.get('x-user-id') || '018f6c4c-3500-7fa1-b1e2-100000000001';
    const companyId =
      req.headers.get('x-company-id') || '018f6c4c-3500-7fa1-b1e2-000000000001';
    const sessionCompanyId = req.headers.get('x-session-company-id') || companyId;

    const body = await req.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Settings Payload',
          status: 400,
          detail: parsed.error.issues[0]?.message || 'Validation failed',
        },
        { status: 400 }
      );
    }

    const updated = await updateMerchantSettings({
      companyId,
      legalName: parsed.data.legalName,
      dbaName: parsed.data.dbaName,
      supportEmail: parsed.data.supportEmail,
      supportPhone: parsed.data.supportPhone,
      statementDescriptor: parsed.data.statementDescriptor,
      payoutSchedule: parsed.data.payoutSchedule,
      actorUserId,
      actorRole,
      sessionCompanyId,
    });

    return NextResponse.json({
      success: true,
      settings: updated,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 400;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/merchant-settings',
        title: 'Settings Update Error',
        status,
        detail: error.message || 'Failed to update company settings',
      },
      { status }
    );
  }
}
