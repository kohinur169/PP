// path: app/api/office/support/tickets/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@/lib/auth/roles';
import {
  getSupportTicketById,
  replyToSupportTicket,
  updateSupportTicketStatus,
} from '@/lib/office/support-engine';

const ticketActionSchema = z.object({
  action: z.enum(['reply', 'status_update']),
  message: z.string().optional(),
  isInternalNote: z.boolean().default(false),
  status: z
    .enum(['open', 'in_progress', 'waiting_on_merchant', 'resolved', 'closed'])
    .optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorRole = roleHeader as Role;

    const ticket = await getSupportTicketById(id, actorRole);

    return NextResponse.json({
      ticket,
    });
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied')
      ? 403
      : error.message?.includes('not found')
      ? 404
      : 500;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/support-ticket',
        title: 'Ticket Retrieval Error',
        status,
        detail: error.message || 'Failed to retrieve support ticket',
      },
      { status }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roleHeader = req.headers.get('x-user-role') || Role.CLIENT;
    const actorId = req.headers.get('x-user-id') || '018f6c4c-3500-7fa1-b1e2-400000000004';
    const authorName = req.headers.get('x-user-name') || 'Customer Support Specialist';
    const actorRole = roleHeader as Role;

    const body = await req.json();
    const parsed = ticketActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Request Payload',
          status: 400,
          detail: parsed.error.issues[0]?.message || 'Validation failed',
        },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'reply') {
      if (!parsed.data.message || parsed.data.message.trim().length === 0) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/validation',
            title: 'Empty Reply',
            status: 400,
            detail: 'Reply message cannot be empty',
          },
          { status: 400 }
        );
      }

      const updated = await replyToSupportTicket({
        ticketId: id,
        message: parsed.data.message,
        isInternalNote: parsed.data.isInternalNote,
        actorId,
        actorRole,
        authorName,
      });

      return NextResponse.json({
        success: true,
        ticket: updated,
      });
    }

    if (parsed.data.action === 'status_update') {
      if (!parsed.data.status) {
        return NextResponse.json(
          {
            type: 'https://kdsolution.it/errors/validation',
            title: 'Missing Status',
            status: 400,
            detail: 'Target status must be specified',
          },
          { status: 400 }
        );
      }

      const updated = await updateSupportTicketStatus({
        ticketId: id,
        status: parsed.data.status,
        actorId,
        actorRole,
      });

      return NextResponse.json({
        success: true,
        ticket: updated,
      });
    }

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/invalid-action',
        title: 'Unsupported Action',
        status: 400,
        detail: 'Action not supported',
      },
      { status: 400 }
    );
  } catch (error: any) {
    const status = error.message?.toLowerCase().includes('denied') ? 403 : 400;
    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/support-ticket-action',
        title: 'Ticket Action Failed',
        status,
        detail: error.message || 'Failed to update support ticket',
      },
      { status }
    );
  }
}
