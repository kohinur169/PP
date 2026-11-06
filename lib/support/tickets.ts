// path: lib/support/tickets.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import { dispatchActivityEmail } from '@/lib/email/activity-mailer';

export type SupportTicketCategory = 'monetary_urgent' | 'stuck_payment' | 'general' | 'technical';
export type SupportTicketPriority = 'urgent' | 'high' | 'normal' | 'low';
export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_on_merchant' | 'resolved' | 'closed';

export interface SupportTicketRecord {
  id: string;
  tenantId: string;
  companyId: string;
  creatorUserId: string;
  assignedToUserId?: string | undefined;
  ticketNumber: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  subject: string;
  description: string;
  slaTargetHours: number;
  firstResponseAt?: string | undefined;
  slaCompliant?: boolean | undefined;
  resolvedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketMessageRecord {
  id: string;
  tenantId: string;
  ticketId: string;
  senderUserId: string;
  senderRole: 'merchant' | 'support';
  body: string;
  attachmentFileIds: string[];
  createdAt: string;
}

export interface CreateSupportTicketInput {
  tenantId: string;
  companyId: string;
  creatorUserId: string;
  creatorEmail: string;
  category: SupportTicketCategory;
  priority?: SupportTicketPriority | undefined;
  subject: string;
  description: string;
  attachmentFileIds?: string[] | undefined;
}

export interface AddTicketMessageInput {
  ticketId: string;
  senderUserId: string;
  senderRole: 'merchant' | 'support';
  body: string;
  attachmentFileIds?: string[] | undefined;
  recipientMerchantEmail?: string | undefined;
  nowOverride?: string | undefined; // For SLA time-travel testing
}

const ticketStore = new Map<string, SupportTicketRecord>();
const messageStore = new Map<string, SupportTicketMessageRecord[]>();
const auditRepo = new AuditLogRepository();
let ticketCounter = 1000;

/**
 * Returns SLA target hours based on mandatory service level standards:
 * - "monetary urgent matters receive a first response within one business day (24 hours)."
 * - "A merchant with a stuck payment receives an answer within 72 hours."
 */
function resolveSlaTargetHours(category: SupportTicketCategory): number {
  switch (category) {
    case 'monetary_urgent':
      return 24; // 1 business day
    case 'stuck_payment':
      return 72; // 72 hours
    default:
      return 120; // 5 business days for general/technical
  }
}

/**
 * Step 153.1: Create a merchant support ticket with file attachment support.
 */
export async function createSupportTicket(
  input: CreateSupportTicketInput
): Promise<SupportTicketRecord> {
  if (!input.subject || input.subject.trim().length === 0) {
    throw new Error('Support ticket subject is required.');
  }

  if (!input.description || input.description.trim().length === 0) {
    throw new Error('Support ticket description is required.');
  }

  const now = new Date().toISOString();
  const id = generateUuidV7();
  ticketCounter++;
  const ticketNumber = `TICK-${ticketCounter}`;
  const slaTargetHours = resolveSlaTargetHours(input.category);

  const ticket: SupportTicketRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    creatorUserId: input.creatorUserId,
    ticketNumber,
    category: input.category,
    priority: input.priority ?? (input.category === 'monetary_urgent' ? 'urgent' : 'normal'),
    status: 'open',
    subject: input.subject.trim(),
    description: input.description.trim(),
    slaTargetHours,
    createdAt: now,
    updatedAt: now,
  };

  ticketStore.set(id, ticket);

  // Store initial message if attachments present
  const initialAttachments = input.attachmentFileIds ?? [];
  const initialMessage: SupportTicketMessageRecord = {
    id: generateUuidV7(),
    tenantId: input.tenantId,
    ticketId: id,
    senderUserId: input.creatorUserId,
    senderRole: 'merchant',
    body: input.description.trim(),
    attachmentFileIds: initialAttachments,
    createdAt: now,
  };

  messageStore.set(id, [initialMessage]);

  logger.info('Support ticket created with SLA target', {
    ticketId: id,
    ticketNumber,
    category: input.category,
    slaTargetHours,
  });

  try {
    await auditRepo.append({
      actor_id: input.creatorUserId,
      action: 'SUPPORT_TICKET_CREATED',
      entity_type: 'support_ticket',
      entity_id: id,
      payload: {
        ticketNumber,
        category: input.category,
        slaTargetHours,
      },
    });
  } catch (err: unknown) {
    logger.warn('Failed to append audit log for ticket creation', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return ticket;
}

/**
 * Step 153.2: Assign support ticket to an office staff member.
 */
export async function assignSupportTicket(
  ticketId: string,
  assignedStaffUserId: string,
  actorUserId: string,
  actorRole: string
): Promise<SupportTicketRecord> {
  if (actorRole !== 'support' && actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only support staff or super_admin can assign support tickets.');
  }

  const ticket = ticketStore.get(ticketId);
  if (!ticket) {
    throw new Error(`Support ticket '${ticketId}' was not found.`);
  }

  ticket.assignedToUserId = assignedStaffUserId;
  ticket.status = ticket.status === 'open' ? 'in_progress' : ticket.status;
  ticket.updatedAt = new Date().toISOString();

  logger.info('Support ticket assigned', {
    ticketId,
    assignedStaffUserId,
  });

  return ticket;
}

/**
 * Step 153.3: Add reply message to ticket and compute SLA compliance.
 * Section 24: "Support service level: monetary urgent matters receive a first response within one business day.
 * A merchant with a stuck payment receives an answer within 72 hours. Service level compliance is recorded."
 */
export async function addTicketMessage(
  input: AddTicketMessageInput
): Promise<{ message: SupportTicketMessageRecord; ticket: SupportTicketRecord }> {
  const ticket = ticketStore.get(input.ticketId);
  if (!ticket) {
    throw new Error(`Support ticket '${input.ticketId}' was not found.`);
  }

  const now = input.nowOverride ?? new Date().toISOString();
  const messageId = generateUuidV7();

  const message: SupportTicketMessageRecord = {
    id: messageId,
    tenantId: ticket.tenantId,
    ticketId: ticket.id,
    senderUserId: input.senderUserId,
    senderRole: input.senderRole,
    body: input.body.trim(),
    attachmentFileIds: input.attachmentFileIds ?? [],
    createdAt: now,
  };

  const existingMessages = messageStore.get(ticket.id) ?? [];
  existingMessages.push(message);
  messageStore.set(ticket.id, existingMessages);

  // Evaluate SLA compliance on first support response
  if (input.senderRole === 'support' && !ticket.firstResponseAt) {
    const createdTimestamp = new Date(ticket.createdAt).getTime();
    const responseTimestamp = new Date(now).getTime();
    const elapsedHours = (responseTimestamp - createdTimestamp) / (1000 * 60 * 60);

    ticket.firstResponseAt = now;
    ticket.slaCompliant = elapsedHours <= ticket.slaTargetHours;

    logger.info('Support ticket first response SLA evaluated and recorded', {
      ticketId: ticket.id,
      elapsedHours: Math.round(elapsedHours * 10) / 10,
      slaTargetHours: ticket.slaTargetHours,
      slaCompliant: ticket.slaCompliant,
    });

    try {
      await auditRepo.append({
        actor_id: input.senderUserId,
        action: 'SUPPORT_SLA_RECORDED',
        entity_type: 'support_ticket',
        entity_id: ticket.id,
        payload: {
          category: ticket.category,
          elapsedHours,
          slaTargetHours: ticket.slaTargetHours,
          slaCompliant: ticket.slaCompliant,
        },
      });
    } catch (err: unknown) {
      logger.warn('Failed to append audit log for SLA recording', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  ticket.updatedAt = now;

  // Send email reply notification to merchant if sent by support staff
  if (input.senderRole === 'support' && input.recipientMerchantEmail) {
    try {
      await dispatchActivityEmail({
        tenantId: ticket.tenantId,
        templateKey: 'support_reply',
        recipient: input.recipientMerchantEmail,
        variables: {
          ticketId: ticket.ticketNumber,
          replyExcerpt: input.body.slice(0, 100),
        },
      });
    } catch (err: unknown) {
      logger.warn('Failed to dispatch support reply email notification', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { message, ticket };
}

/**
 * Step 153.4: Update ticket status (e.g. resolve, close).
 */
export async function updateTicketStatus(
  ticketId: string,
  newStatus: SupportTicketStatus,
  actorUserId: string,
  actorRole: string
): Promise<SupportTicketRecord> {
  if (actorRole !== 'support' && actorRole !== 'super_admin') {
    throw new Error('Unauthorized: Only support staff or super_admin can update ticket status.');
  }

  const ticket = ticketStore.get(ticketId);
  if (!ticket) {
    throw new Error(`Support ticket '${ticketId}' was not found.`);
  }

  const now = new Date().toISOString();
  ticket.status = newStatus;
  if (newStatus === 'resolved' || newStatus === 'closed') {
    ticket.resolvedAt = now;
  }
  ticket.updatedAt = now;

  return ticket;
}

/**
 * Retrieves a support ticket by ID.
 */
export async function getSupportTicket(ticketId: string): Promise<SupportTicketRecord | null> {
  return ticketStore.get(ticketId) ?? null;
}

/**
 * Retrieves messages for a ticket.
 */
export async function getTicketMessages(ticketId: string): Promise<SupportTicketMessageRecord[]> {
  return messageStore.get(ticketId) ?? [];
}

/**
 * Resets in-memory stores for test isolation.
 */
export function resetSupportTicketStore(): void {
  ticketStore.clear();
  messageStore.clear();
}
