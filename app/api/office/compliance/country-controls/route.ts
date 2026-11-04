// path: app/api/office/compliance/country-controls/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  CountryControlRepository,
  seedCountryCatalog,
  proposeCountryStateChange,
  approveCountryStateChange,
  emergencyDisableCountry,
  SanctionedCountryFreezeViolationError,
  DualControlSelfApprovalError,
} from '@/lib/compliance/country-control';

export const dynamic = 'force-dynamic';

const countryRepo = new CountryControlRepository();

/**
 * Step 081.3: GET /api/office/compliance/country-controls
 * Retrieves global country enablement statuses, sanctions freeze flags, and pending proposals.
 */
export async function GET(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';

  const actorRole = roleHeader as Role;
  const authorizedRoles: Role[] = [
    Role.SUPER_ADMIN,
    Role.CEO,
    Role.COMPLIANCE_KYC,
    Role.FINANCE_OPS,
    Role.SUPPORT,
  ];

  if (!authorizedRoles.includes(actorRole)) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Insufficient privileges to view country governance controls.',
      },
      { status: 403 }
    );
  }

  await seedCountryCatalog(countryRepo);
  const countries = await countryRepo.findMany({ includeDeleted: false });

  const sorted = countries.sort((a, b) => a.country_name.localeCompare(b.country_name));

  const summary = {
    total: sorted.length,
    enabled: sorted.filter((c) => c.is_enabled).length,
    disabled: sorted.filter((c) => !c.is_enabled && !c.is_sanctioned_frozen).length,
    sanctionedFrozen: sorted.filter((c) => c.is_sanctioned_frozen).length,
    pendingApproval: sorted.filter((c) => c.pending_change_status === 'pending_approval').length,
  };

  return NextResponse.json({
    success: true,
    summary,
    countries: sorted,
  });
}

/**
 * Step 081.3: POST /api/office/compliance/country-controls
 * Dual-approval workflow for enabling, disabling, and emergency freezing countries.
 */
export async function POST(req: NextRequest | Request) {
  const roleHeader =
    req.headers.get('x-user-role') ||
    req.headers.get('x-staff-role') ||
    '';

  const actorRole = roleHeader as Role;
  const actorId = req.headers.get('x-user-id') || '00000000-0000-0000-0000-000000000000';

  const authorizedRoles = [Role.SUPER_ADMIN, Role.CEO];
  if (!authorizedRoles.includes(actorRole)) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/forbidden',
        title: 'Access Denied',
        status: 403,
        detail: 'Only Super Admin and CEO can mutate global country availability settings.',
      },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Invalid Request Body',
        status: 400,
        detail: 'JSON body required.',
      },
      { status: 400 }
    );
  }

  const { action, countryCode } = body;
  if (!countryCode || typeof countryCode !== 'string' || countryCode.trim().length !== 2) {
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Invalid Country Code',
        status: 400,
        detail: 'Valid ISO 3166-1 alpha-2 country code required.',
      },
      { status: 400 }
    );
  }

  try {
    if (action === 'propose') {
      const { enabled, justification } = body;
      if (typeof enabled !== 'boolean' || !justification) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/bad-request',
            title: 'Missing Parameters',
            status: 400,
            detail: 'Boolean "enabled" and string "justification" are required.',
          },
          { status: 400 }
        );
      }

      const updated = await proposeCountryStateChange({
        countryCode,
        enabled,
        justification,
        actorId,
        actorRole,
      });

      return NextResponse.json({
        success: true,
        message: `Proposal submitted to ${enabled ? 'enable' : 'disable'} ${updated.country_name}. Awaiting dual confirmation from counterpart executive.`,
        country: updated,
      });
    }

    if (action === 'approve') {
      const { notes } = body;
      const updated = await approveCountryStateChange({
        countryCode,
        actorId,
        actorRole,
        notes,
      });

      return NextResponse.json({
        success: true,
        message: `State change confirmed for ${updated.country_name}. Status is now ${updated.is_enabled ? 'ENABLED' : 'DISABLED'}.`,
        country: updated,
      });
    }

    if (action === 'emergency_disable') {
      const { reason } = body;
      if (!reason) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/bad-request',
            title: 'Reason Required',
            status: 400,
            detail: 'Justification reason is required for emergency disable.',
          },
          { status: 400 }
        );
      }

      const updated = await emergencyDisableCountry({
        countryCode,
        reason,
        actorId,
        actorRole,
      });

      return NextResponse.json({
        success: true,
        message: `Emergency freeze executed for ${updated.country_name}. Immediate platform transaction block active.`,
        country: updated,
      });
    }

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/bad-request',
        title: 'Unknown Action',
        status: 400,
        detail: 'Action must be one of: "propose", "approve", "emergency_disable".',
      },
      { status: 400 }
    );
  } catch (err: any) {
    if (err instanceof SanctionedCountryFreezeViolationError) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/sanctions-violation',
          title: 'Fatal Sanctions Violation',
          status: 422,
          detail: err.message,
        },
        { status: 422 }
      );
    }

    if (err instanceof DualControlSelfApprovalError) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/dual-control-violation',
          title: 'Dual Control Violation',
          status: 422,
          detail: err.message,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/operation-failed',
        title: 'Operation Failed',
        status: 400,
        detail: err.message || 'Country governance operation failed.',
      },
      { status: 400 }
    );
  }
}
