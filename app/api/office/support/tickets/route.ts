// path: app/api/office/support/tickets/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/lib/auth/roles';
import { listSupportTickets } from '@/lib/office/support-engine';

export async function GET(req: NextRequest) {
  try {
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;

    const tickets = await listSupportTickets(actorRole);

    return NextResponse.json({
      tickets,
      totalCount: tickets.length,
      openCount: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/support-tickets',
        title: 'Support Tickets Error',
        status,
        detail: error.message || 'Failed to list support tickets',
      },
      { status }
    );
  }
}
