// path: tests/auth/support-isolation.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role, Permission, hasPermission } from '@/lib/auth/roles';
import {
  resetSupportDataForTest,
  seedSupportTicketForTest,
  listSupportTickets,
  getSupportTicketById,
  replyToSupportTicket,
  updateSupportTicketStatus,
  assertSupportZeroAccessToGateways,
  assertSupportZeroAccessToKyc,
  assertSupportZeroAccessToPayouts,
  SupportTicket,
} from '@/lib/office/support-engine';
import { AuditLogRepository } from '@/lib/db/audit';
import { GET as getTickets } from '@/app/api/office/support/tickets/route';
import {
  GET as getTicketById,
  POST as postTicketAction,
} from '@/app/api/office/support/tickets/[id]/route';
import { GET as probeGateways } from '@/app/api/office/support/gateways-probe/route';
import { POST as probeKyc } from '@/app/api/office/support/kyc-probe/route';

describe('Step 070: Customer Support Portal with Strict Gateway/KYC Isolation', () => {
  const supportOperatorId = '018f6c4c-3500-7fa1-b1e2-400000000004';
  let mockAuditRepo: AuditLogRepository;
  let auditLogsRecorded: any[];

  beforeEach(() => {
    resetSupportDataForTest();
    auditLogsRecorded = [];

    mockAuditRepo = {
      createLog: async (input: any) => {
        auditLogsRecorded.push(input);
        return {} as any;
      },
    } as unknown as AuditLogRepository;
  });

  describe('Step 070.1 & Step 070.2: Support Ticketing Operations', () => {
    it('allows SUPPORT role to list, inspect, reply to tickets and write internal notes', async () => {
      const ticket: SupportTicket = {
        id: 'tkt_iso_01',
        ticketNumber: 'TKT-2026-0001',
        companyId: '018f6c4c-3500-7fa1-b1e2-000000000001',
        merchantName: 'Acme Digital Services',
        subject: 'Collect.js tokenization question',
        priority: 'high',
        category: 'integration_help',
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'msg_01',
            authorId: 'user_merchant_01',
            authorRole: 'merchant',
            authorName: 'Merchant Tech Lead',
            message: 'Where do we supply the test gateway public token?',
            isInternalNote: false,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      seedSupportTicketForTest(ticket);

      // List tickets
      const tickets = await listSupportTickets(Role.SUPPORT);
      expect(tickets).toHaveLength(1);

      // Get ticket details
      const fetched = await getSupportTicketById('tkt_iso_01', Role.SUPPORT);
      expect(fetched.ticketNumber).toBe('TKT-2026-0001');

      // Post internal staff note
      const withNote = await replyToSupportTicket({
        ticketId: 'tkt_iso_01',
        message: 'Checked docs: token is configured in data-token field.',
        isInternalNote: true,
        actorId: supportOperatorId,
        actorRole: Role.SUPPORT,
        authorName: 'Support Operator',
        auditRepo: mockAuditRepo,
      });
      expect(withNote.messages).toHaveLength(2);
      expect(withNote.messages[1].isInternalNote).toBe(true);

      // Post public reply to merchant
      const withReply = await replyToSupportTicket({
        ticketId: 'tkt_iso_01',
        message: 'Hello, please pass the public token inside the Collect.js configure() call.',
        isInternalNote: false,
        actorId: supportOperatorId,
        actorRole: Role.SUPPORT,
        authorName: 'Support Operator',
        auditRepo: mockAuditRepo,
      });
      expect(withReply.messages).toHaveLength(3);
      expect(withReply.messages[2].isInternalNote).toBe(false);

      // Update status to resolved
      const resolved = await updateSupportTicketStatus({
        ticketId: 'tkt_iso_01',
        status: 'resolved',
        actorId: supportOperatorId,
        actorRole: Role.SUPPORT,
        auditRepo: mockAuditRepo,
      });
      expect(resolved.status).toBe('resolved');

      // Verify audit logs were captured
      expect(auditLogsRecorded).toHaveLength(3);
      expect(auditLogsRecorded[0].action).toBe('SUPPORT_TICKET_REPLIED');
      expect(auditLogsRecorded[2].action).toBe('SUPPORT_TICKET_STATUS_UPDATED');
    });
  });

  describe('Step 070.3 & Step 070.4: Strict Zero-Access Gateway & KYC Isolation', () => {
    it('strictly forbids SUPPORT role from accessing payment gateway credentials or keys', () => {
      // Permission check
      expect(hasPermission(Role.SUPPORT, Permission.MANAGE_GATEWAYS)).toBe(false);
      expect(hasPermission(Role.SUPPORT, Permission.ROTATE_GATEWAY_KEYS)).toBe(false);

      // Assertion engine throws Access Denied
      expect(() => assertSupportZeroAccessToGateways(Role.SUPPORT)).toThrow(
        /strictly prohibited from accessing gateway credentials/i
      );
    });

    it('strictly forbids SUPPORT role from making KYC underwriting decisions', () => {
      // Permission check
      expect(hasPermission(Role.SUPPORT, Permission.REVIEW_KYC)).toBe(false);

      // Assertion engine throws Access Denied
      expect(() => assertSupportZeroAccessToKyc(Role.SUPPORT)).toThrow(
        /strictly prohibited from reviewing or approving merchant KYC/i
      );
    });

    it('strictly forbids SUPPORT role from releasing payouts or modifying ledger balances', () => {
      // Permission check
      expect(hasPermission(Role.SUPPORT, Permission.RELEASE_PAYOUT)).toBe(false);

      // Assertion engine throws Access Denied
      expect(() => assertSupportZeroAccessToPayouts(Role.SUPPORT)).toThrow(
        /strictly prohibited from releasing payouts/i
      );
    });
  });

  describe('HTTP API Route Probes & Isolation Enforcement', () => {
    it('returns HTTP 403 Forbidden when SUPPORT accesses gateway-probe endpoint', async () => {
      const req = new NextRequest('http://localhost/api/office/support/gateways-probe', {
        headers: { 'x-user-role': Role.SUPPORT },
      });
      const res = await probeGateways(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.detail).toMatch(/strictly prohibited from accessing gateway credentials/i);
    });

    it('returns HTTP 403 Forbidden when SUPPORT attempts KYC approval probe', async () => {
      const req = new NextRequest('http://localhost/api/office/support/kyc-probe', {
        method: 'POST',
        headers: { 'x-user-role': Role.SUPPORT },
      });
      const res = await probeKyc(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.detail).toMatch(/strictly prohibited from reviewing or approving merchant KYC/i);
    });

    it('processes ticket operations via /api/office/support/tickets endpoints', async () => {
      seedSupportTicketForTest({
        id: 'tkt_http_01',
        ticketNumber: 'TKT-HTTP-100',
        companyId: '018f6c4c-3500-7fa1-b1e2-000000000001',
        merchantName: 'Acme Digital',
        subject: 'General inquiry',
        priority: 'low',
        category: 'general',
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      // GET all tickets
      const getReq = new NextRequest('http://localhost/api/office/support/tickets', {
        headers: { 'x-user-role': Role.SUPPORT },
      });
      const getRes = await getTickets(getReq);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.totalCount).toBe(1);

      // GET single ticket
      const getSingleReq = new NextRequest('http://localhost/api/office/support/tickets/tkt_http_01', {
        headers: { 'x-user-role': Role.SUPPORT },
      });
      const getSingleRes = await getTicketById(getSingleReq, {
        params: Promise.resolve({ id: 'tkt_http_01' }),
      });
      expect(getSingleRes.status).toBe(200);

      // POST reply
      const postReq = new NextRequest('http://localhost/api/office/support/tickets/tkt_http_01', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.SUPPORT,
          'x-user-id': supportOperatorId,
          'x-user-name': 'Support Tech',
        },
        body: JSON.stringify({
          action: 'reply',
          message: 'Thank you for contacting support.',
          isInternalNote: false,
        }),
      });
      const postRes = await postTicketAction(postReq, {
        params: Promise.resolve({ id: 'tkt_http_01' }),
      });
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.success).toBe(true);
      expect(postData.ticket.messages).toHaveLength(1);
    });
  });
});
