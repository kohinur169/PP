// path: lib/office/support-engine.ts

import crypto from 'node:crypto';
import { Role, Permission, assertPermission, hasPermission } from '@/lib/auth/roles';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export interface SupportMessage {
  readonly id: string;
  readonly authorId: string;
  readonly authorRole: 'support' | 'merchant';
  readonly authorName: string;
  readonly message: string;
  readonly isInternalNote: boolean;
  readonly createdAt: string;
}

export interface SupportTicket {
  readonly id: string;
  readonly ticketNumber: string;
  readonly companyId: string;
  readonly merchantName: string;
  readonly subject: string;
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly category: 'payment_inquiry' | 'chargeback_question' | 'integration_help' | 'general';
  status: 'open' | 'in_progress' | 'waiting_on_merchant' | 'resolved' | 'closed';
  readonly createdAt: string;
  updatedAt: string;
  assignedTo?: string | undefined;
  messages: SupportMessage[];
}

const ticketRegistry = new Map<string, SupportTicket>();

/**
 * Resets support store for test isolation.
 */
export function resetSupportDataForTest(): void {
  ticketRegistry.clear();
}

/**
 * Seeds a support ticket into the registry.
 */
export function seedSupportTicketForTest(ticket: SupportTicket): void {
  ticketRegistry.set(ticket.id, {
    ...ticket,
    messages: [...ticket.messages],
  });
}

/**
 * Step 070.1: Lists support tickets for customer support operators.
 */
export async function listSupportTickets(actorRole: Role): Promise<SupportTicket[]> {
  assertPermission(actorRole, Permission.VIEW_TICKETS);
  return Array.from(ticketRegistry.values());
}

/**
 * Step 070.2: Retrieves a specific support ticket by ID.
 */
export async function getSupportTicketById(
  ticketId: string,
  actorRole: Role
): Promise<SupportTicket> {
  assertPermission(actorRole, Permission.VIEW_TICKETS);
  const ticket = ticketRegistry.get(ticketId);
  if (!ticket) {
    throw new Error(`Support ticket "${ticketId}" not found.`);
  }
  return {
    ...ticket,
    messages: [...ticket.messages],
  };
}

/**
 * Step 070.2: Appends a reply or internal note to a support ticket.
 */
export async function replyToSupportTicket(params: {
  readonly ticketId: string;
  readonly message: string;
  readonly isInternalNote: boolean;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly authorName: string;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<SupportTicket> {
  const { ticketId, message, isInternalNote, actorId, actorRole, authorName, auditRepo } = params;

  assertPermission(actorRole, Permission.HELP_MERCHANT);

  const ticket = ticketRegistry.get(ticketId);
  if (!ticket) {
    throw new Error(`Support ticket "${ticketId}" not found.`);
  }

  const newMessage: SupportMessage = {
    id: `msg_${crypto.randomUUID()}`,
    authorId: actorId,
    authorRole: 'support',
    authorName,
    message,
    isInternalNote,
    createdAt: new Date().toISOString(),
  };

  ticket.messages.push(newMessage);
  ticket.updatedAt = new Date().toISOString();
  if (ticket.status === 'open') {
    ticket.status = 'in_progress';
  }

  ticketRegistry.set(ticketId, ticket);

  logger.info('Support ticket replied by staff operator', {
    ticketId,
    ticketNumber: ticket.ticketNumber,
    isInternalNote,
    actorId,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: ticket.companyId,
      actor_id: actorId,
      action: 'SUPPORT_TICKET_REPLIED',
      entity_type: 'support_ticket',
      entity_id: ticket.id,
      payload: {
        ticketNumber: ticket.ticketNumber,
        isInternalNote,
        messageLength: message.length,
      },
    });
  }

  return {
    ...ticket,
    messages: [...ticket.messages],
  };
}

/**
 * Step 070.2: Updates ticket status (e.g. resolved, closed, waiting_on_merchant).
 */
export async function updateSupportTicketStatus(params: {
  readonly ticketId: string;
  readonly status: 'open' | 'in_progress' | 'waiting_on_merchant' | 'resolved' | 'closed';
  readonly actorId: string;
  readonly actorRole: Role;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<SupportTicket> {
  const { ticketId, status, actorId, actorRole, auditRepo } = params;

  if (status === 'closed' || status === 'resolved') {
    assertPermission(actorRole, Permission.RESOLVE_TICKETS);
  } else {
    assertPermission(actorRole, Permission.HELP_MERCHANT);
  }

  const ticket = ticketRegistry.get(ticketId);
  if (!ticket) {
    throw new Error(`Support ticket "${ticketId}" not found.`);
  }

  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  ticketRegistry.set(ticketId, ticket);

  logger.info('Support ticket status updated', {
    ticketId,
    ticketNumber: ticket.ticketNumber,
    newStatus: status,
    actorId,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: ticket.companyId,
      actor_id: actorId,
      action: 'SUPPORT_TICKET_STATUS_UPDATED',
      entity_type: 'support_ticket',
      entity_id: ticket.id,
      payload: {
        ticketNumber: ticket.ticketNumber,
        status,
      },
    });
  }

  return {
    ...ticket,
    messages: [...ticket.messages],
  };
}

/**
 * Step 070.3: Architectural isolation assertion against gateway access for support role.
 * Throws an explicit Access Denied error if any support operator attempts to access gateway credentials.
 */
export function assertSupportZeroAccessToGateways(actorRole: Role): void {
  if (actorRole === Role.SUPPORT || !hasPermission(actorRole, Permission.MANAGE_GATEWAYS)) {
    logger.warn('Unauthorized gateway key access attempt blocked for support role', {
      role: actorRole,
      violation: 'ZERO_ACCESS_GATEWAY_KEYS',
    });
    throw new Error(
      'Access Denied: Support role is strictly prohibited from accessing gateway credentials, API keys, or Collect.js secrets.'
    );
  }
}

/**
 * Step 070.3: Architectural isolation assertion against KYC approvals for support role.
 * Throws an explicit Access Denied error if any support operator attempts to access KYC underwriting.
 */
export function assertSupportZeroAccessToKyc(actorRole: Role): void {
  if (actorRole === Role.SUPPORT || !hasPermission(actorRole, Permission.REVIEW_KYC)) {
    logger.warn('Unauthorized KYC approval attempt blocked for support role', {
      role: actorRole,
      violation: 'ZERO_ACCESS_KYC_DECISIONS',
    });
    throw new Error(
      'Access Denied: Support role is strictly prohibited from reviewing or approving merchant KYC underwriting packets.'
    );
  }
}

/**
 * Step 070.3: Architectural isolation assertion against payout releases for support role.
 */
export function assertSupportZeroAccessToPayouts(actorRole: Role): void {
  if (actorRole === Role.SUPPORT || !hasPermission(actorRole, Permission.RELEASE_PAYOUT)) {
    logger.warn('Unauthorized payout release attempt blocked for support role', {
      role: actorRole,
      violation: 'ZERO_ACCESS_PAYOUT_RELEASE',
    });
    throw new Error(
      'Access Denied: Support role is strictly prohibited from releasing payouts or altering banking ledger records.'
    );
  }
}
