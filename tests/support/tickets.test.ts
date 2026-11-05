// path: tests/support/tickets.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSupportTicket,
  assignSupportTicket,
  addTicketMessage,
  updateTicketStatus,
  getSupportTicket,
  getTicketMessages,
  resetSupportTicketStore,
} from '@/lib/support/tickets';
import { resetActivityMailerStore } from '@/lib/email/activity-mailer';

describe('Support Ticketing System & SLA Compliance Monitor (Step 153)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const companyId = '22222222-2222-4222-8222-222222222222';
  const merchantUserId = '33333333-3333-4333-8333-333333333333';
  const supportStaffId = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    resetSupportTicketStore();
    resetActivityMailerStore();
  });

  describe('Ticket Creation & SLA Targets (Step 153.1)', () => {
    it('sets 24h SLA target for monetary urgent matters and 72h for stuck payments', async () => {
      // 1. Monetary urgent ticket
      const urgentTicket = await createSupportTicket({
        tenantId,
        companyId,
        creatorUserId: merchantUserId,
        creatorEmail: 'merchant@store.com',
        category: 'monetary_urgent',
        subject: 'Dispute Chargeback Deduction Clarification',
        description: 'Our reserve was debited unexpectedly for dispute #8812.',
        attachmentFileIds: ['file_statement_001.pdf'],
      });

      expect(urgentTicket.id).toBeDefined();
      expect(urgentTicket.ticketNumber).toMatch(/^TICK-/);
      expect(urgentTicket.slaTargetHours).toBe(24); // 1 business day
      expect(urgentTicket.priority).toBe('urgent');

      // 2. Stuck payment ticket
      const stuckTicket = await createSupportTicket({
        tenantId,
        companyId,
        creatorUserId: merchantUserId,
        creatorEmail: 'merchant@store.com',
        category: 'stuck_payment',
        subject: 'Customer Card Authorization Stuck Pending',
        description: 'Payment intent pi_9921 is stuck in authorized state.',
      });

      expect(stuckTicket.slaTargetHours).toBe(72); // 72 hours
      expect(stuckTicket.firstResponseAt).toBeUndefined();
      expect(stuckTicket.slaCompliant).toBeUndefined();
    });
  });

  describe('Ticket Assignment & Status Updates (Step 153.2)', () => {
    it('allows support staff to assign tickets and update status', async () => {
      const ticket = await createSupportTicket({
        tenantId,
        companyId,
        creatorUserId: merchantUserId,
        creatorEmail: 'merchant@store.com',
        category: 'general',
        subject: 'API Webhook Header Clarification',
        description: 'Can we configure custom HMAC headers?',
      });

      const assigned = await assignSupportTicket(
        ticket.id,
        supportStaffId,
        supportStaffId,
        'support'
      );

      expect(assigned.assignedToUserId).toBe(supportStaffId);
      expect(assigned.status).toBe('in_progress');

      const resolved = await updateTicketStatus(
        ticket.id,
        'resolved',
        supportStaffId,
        'support'
      );

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).toBeDefined();
    });

    it('denies merchants from assigning tickets or updating status', async () => {
      const ticket = await createSupportTicket({
        tenantId,
        companyId,
        creatorUserId: merchantUserId,
        creatorEmail: 'merchant@store.com',
        category: 'general',
        subject: 'General Question',
        description: 'Question body',
      });

      await expect(
        assignSupportTicket(ticket.id, merchantUserId, merchantUserId, 'merchant_admin')
      ).rejects.toThrow(/Only support staff or super_admin can assign/);
    });
  });

  describe('SLA Compliance Calculation & Recording (Step 153.3)', () => {
    it('records sla_compliant: true when support staff replies within target deadline', async () => {
      // Created at T0
      const ticket = await createSupportTicket({
        tenantId,
        companyId,
        creatorUserId: merchantUserId,
        creatorEmail: 'merchant@store.com',
        category: 'monetary_urgent', // 24h SLA target
        subject: 'Urgent Wire Settlement Query',
        description: 'Wire settlement missing from dashboard.',
      });

      // Support staff replies 8 hours later (compliant <= 24h)
      const createdDate = new Date(ticket.createdAt);
      const eightHoursLater = new Date(createdDate.getTime() + 8 * 60 * 60 * 1000).toISOString();

      const { message, ticket: updatedTicket } = await addTicketMessage({
        ticketId: ticket.id,
        senderUserId: supportStaffId,
        senderRole: 'support',
        body: 'Hello, we investigated and the wire batch will execute at 14:00 UTC.',
        recipientMerchantEmail: 'merchant@store.com',
        nowOverride: eightHoursLater,
      });

      expect(message.id).toBeDefined();
      expect(updatedTicket.firstResponseAt).toBe(eightHoursLater);
      expect(updatedTicket.slaCompliant).toBe(true);

      const refreshed = await getSupportTicket(ticket.id);
      expect(refreshed?.slaCompliant).toBe(true);
    });

    it('records sla_compliant: false when first response exceeds SLA target hours', async () => {
      // Created at T0 with 24h SLA target
      const ticket = await createSupportTicket({
        tenantId,
        companyId,
        creatorUserId: merchantUserId,
        creatorEmail: 'merchant@store.com',
        category: 'monetary_urgent', // 24h SLA target
        subject: 'Urgent Chargeback',
        description: 'Urgent matter',
      });

      // Support staff replies 30 hours later (breached > 24h)
      const createdDate = new Date(ticket.createdAt);
      const thirtyHoursLater = new Date(createdDate.getTime() + 30 * 60 * 60 * 1000).toISOString();

      const { ticket: updatedTicket } = await addTicketMessage({
        ticketId: ticket.id,
        senderUserId: supportStaffId,
        senderRole: 'support',
        body: 'Apologies for the delay.',
        recipientMerchantEmail: 'merchant@store.com',
        nowOverride: thirtyHoursLater,
      });

      expect(updatedTicket.slaCompliant).toBe(false);

      const messages = await getTicketMessages(ticket.id);
      expect(messages.length).toBe(2); // Initial description + support reply
    });
  });
});
