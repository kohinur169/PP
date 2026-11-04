// path: tests/compliance/calendar.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@/lib/auth/roles';
import {
  ComplianceCalendarRepository,
  calculateDaysRemaining,
  evaluateEventUrgency,
  processComplianceCalendarAlerts,
  markEventRenewed,
  clearDispatchedCalendarAlerts,
  getDispatchedCalendarAlerts,
  clearComplianceCalendarStore,
} from '@/lib/compliance/calendar';
import { AuditLogRepository } from '@/lib/db/audit';
import { GET as getCalendarEvents, POST as postCalendarAction } from '@/app/api/office/compliance/calendar/route';

describe('Step 079: Compliance Calendar, Cyber Insurance & PCI Attestation Renewal Tracker', () => {
  const complianceOfficerId = '018f6c4c-3500-7fa1-b1e2-200000000002';
  const superAdminId = '018f6c4c-3500-7fa1-b1e2-000000000001';
  const ceoId = '018f6c4c-3500-7fa1-b1e2-100000000001';

  let calendarRepo: ComplianceCalendarRepository;
  let auditRepo: AuditLogRepository;
  let loggedAuditEvents: any[];

  beforeEach(async () => {
    clearDispatchedCalendarAlerts();
    clearComplianceCalendarStore();
    calendarRepo = new ComplianceCalendarRepository();
    loggedAuditEvents = [];

    auditRepo = {
      createLog: async (input: any) => {
        loggedAuditEvents.push(input);
        return {
          id: `audit_${Date.now()}`,
          ...input,
          created_at: new Date().toISOString(),
        } as any;
      },
    } as unknown as AuditLogRepository;
  });

  describe('Step 079.1 & Step 079.2: Deadline Calculation & Urgency Ratings', () => {
    it('calculates remaining calendar days and urgency accurately', () => {
      const now = new Date('2026-11-01T00:00:00.000Z');

      // 45 days in future
      const d45 = new Date('2026-12-16T00:00:00.000Z');
      expect(calculateDaysRemaining(d45, now)).toBe(45);
      expect(evaluateEventUrgency(45)).toBe('urgent');

      // 15 days in future
      const d15 = new Date('2026-11-16T00:00:00.000Z');
      expect(calculateDaysRemaining(d15, now)).toBe(15);
      expect(evaluateEventUrgency(15)).toBe('critical');

      // 95 days in future
      const d95 = new Date('2027-02-04T00:00:00.000Z');
      expect(calculateDaysRemaining(d95, now)).toBe(95);
      expect(evaluateEventUrgency(95)).toBe('active');

      // Expired date
      const dPast = new Date('2026-10-31T00:00:00.000Z');
      expect(calculateDaysRemaining(dPast, now)).toBe(-1);
      expect(evaluateEventUrgency(-1)).toBe('expired');
    });
  });

  describe('Step 079.3: Automated Background Alert Processing & Escalation', () => {
    it('seeds expiring PCI AoC date in 45 days, flags status as urgent, and sends office alert', async () => {
      const baseNow = new Date('2026-11-01T00:00:00.000Z');
      const expiry45Days = new Date('2026-12-16T00:00:00.000Z').toISOString();

      // Seed PCI AoC event expiring in 45 days
      const pciEvent = await calendarRepo.create({
        event_name: 'Annual PCI-DSS Level 1 Attestation of Compliance (AoC)',
        category: 'pci_dss',
        expiry_date: expiry45Days,
        assigned_to: complianceOfficerId,
        status: 'active',
        notification_lead_days: [90, 60, 30, 7],
      });

      // Execute background worker
      const result = await processComplianceCalendarAlerts({
        referenceDate: baseNow,
        repo: calendarRepo,
        auditRepo,
      });

      expect(result.processedEvents).toBe(1);
      expect(result.alertsGenerated).toBe(1);

      // Verify dispatched alert details (threshold 60 triggered)
      const alerts = getDispatchedCalendarAlerts();
      expect(alerts).toHaveLength(1);
      const alert = alerts[0];
      expect(alert.eventId).toBe(pciEvent.id);
      expect(alert.threshold).toBe(60);
      expect(alert.daysRemaining).toBe(45);
      expect(alert.severity).toBe('HIGH');
      expect(alert.recipientRoles).toContain(Role.COMPLIANCE_KYC);
      expect(alert.recipientRoles).toContain(Role.SUPER_ADMIN);

      // Verify database record updated with urgency status
      const updated = await calendarRepo.findById(pciEvent.id);
      expect(updated?.status).toBe('urgent');
      expect(updated?.last_alert_threshold).toBe(60);

      // Verify audit log
      expect(loggedAuditEvents).toHaveLength(1);
      expect(loggedAuditEvents[0].action).toBe('COMPLIANCE_DEADLINE_ALERT');

      // Re-running on same day does not duplicate alert for 60d threshold
      const secondRun = await processComplianceCalendarAlerts({
        referenceDate: baseNow,
        repo: calendarRepo,
        auditRepo,
      });
      expect(secondRun.alertsGenerated).toBe(0);
    });

    it('escalates to CRITICAL and includes CEO when deadline is within 30 days', async () => {
      const baseNow = new Date('2026-11-01T00:00:00.000Z');
      const expiry20Days = new Date('2026-11-21T00:00:00.000Z').toISOString();

      await calendarRepo.create({
        event_name: 'Corporate Cyber Insurance Policy Renewal',
        category: 'cyber_insurance',
        expiry_date: expiry20Days,
        assigned_to: complianceOfficerId,
        status: 'active',
        notification_lead_days: [90, 60, 30, 7],
      });

      await processComplianceCalendarAlerts({
        referenceDate: baseNow,
        repo: calendarRepo,
        auditRepo,
      });

      const alerts = getDispatchedCalendarAlerts();
      expect(alerts).toHaveLength(1);
      const alert = alerts[0];
      expect(alert.threshold).toBe(30);
      expect(alert.severity).toBe('CRITICAL');
      expect(alert.recipientRoles).toContain(Role.CEO);
      expect(alert.recipientRoles).toContain(Role.SUPER_ADMIN);
      expect(alert.recipientRoles).toContain(Role.COMPLIANCE_KYC);
    });
  });

  describe('Step 079.4: Renewal Tracking & Evidence Linking', () => {
    it('marks compliance item renewed with fresh expiry date and resets alerts', async () => {
      const expiryOld = new Date('2026-11-20T00:00:00.000Z').toISOString();
      const expiryNew = new Date('2027-11-20T00:00:00.000Z').toISOString();

      const event = await calendarRepo.create({
        event_name: 'Annual External Penetration Test & Code Audit',
        category: 'security_audit',
        expiry_date: expiryOld,
        assigned_to: complianceOfficerId,
        status: 'urgent',
        last_alert_threshold: 30,
      });

      const renewed = await markEventRenewed(
        {
          eventId: event.id,
          newExpiryDate: expiryNew,
          evidenceFileId: '018f6c4c-3500-7fa1-b1e2-999999999999',
          actorId: complianceOfficerId,
          notes: 'Report issued with zero critical findings by NCC Group.',
        },
        { repo: calendarRepo, auditRepo }
      );

      expect(renewed.status).toBe('renewed');
      expect(renewed.expiry_date).toBe(expiryNew);
      expect(renewed.last_alert_threshold).toBeNull();
      expect(renewed.evidence_file_id).toBe('018f6c4c-3500-7fa1-b1e2-999999999999');

      // Verify audit log
      const audit = loggedAuditEvents.find((e) => e.action === 'COMPLIANCE_DEADLINE_RENEWED');
      expect(audit).toBeDefined();
    });
  });

  describe('HTTP API Route Integration: /api/office/compliance/calendar', () => {
    it('allows Compliance KYC to query upcoming deadlines via GET', async () => {
      await calendarRepo.create({
        event_name: 'Acquiring Bank Direct Agreement Annual Review',
        category: 'banking_contract',
        expiry_date: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString(),
        assigned_to: complianceOfficerId,
        status: 'active',
      });

      const req = new NextRequest('http://localhost/api/office/compliance/calendar', {
        headers: {
          'x-user-role': Role.COMPLIANCE_KYC,
          'x-user-id': complianceOfficerId,
        },
      });

      const res = await getCalendarEvents(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.events[0].daysRemaining).toBeDefined();
    });

    it('rejects unauthorized roles (support, blogger, owner) with HTTP 403', async () => {
      const req = new NextRequest('http://localhost/api/office/compliance/calendar', {
        headers: {
          'x-user-role': Role.SUPPORT,
        },
      });

      const res = await getCalendarEvents(req);
      expect(res.status).toBe(403);
    });

    it('executes background alert processing via POST action "process_alerts"', async () => {
      const req = new NextRequest('http://localhost/api/office/compliance/calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': Role.SUPER_ADMIN,
        },
        body: JSON.stringify({ action: 'process_alerts' }),
      });

      const res = await postCalendarAction(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result).toBeDefined();
    });
  });
});
