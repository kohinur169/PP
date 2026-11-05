// path: tests/compliance/calendar-worker.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateCalendarUrgency,
  runComplianceCalendarExpiryAlertsJob,
  seedComplianceCalendarEvent,
  getComplianceCalendarEvent,
  resetComplianceCalendarStore,
} from '@/lib/compliance/calendar-worker';
import { resetActivityMailerStore } from '@/lib/email/activity-mailer';

describe('Compliance Calendar Expiry Alerts Worker (Step 165)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const officerEmail = 'compliance@kdsolution.test';

  beforeEach(() => {
    resetComplianceCalendarStore();
    resetActivityMailerStore();
  });

  describe('Urgency Color and Status Rules (Step 165.1)', () => {
    it('evaluates color-coded urgency and status based on remaining days', () => {
      // > 30 days -> green
      const greenEval = evaluateCalendarUrgency('2026-12-25T00:00:00Z', '2026-11-05');
      expect(greenEval.urgency).toBe('green');
      expect(greenEval.status).toBe('active');
      expect(greenEval.daysRemaining).toBe(50);

      // 8-30 days -> yellow
      const yellowEval = evaluateCalendarUrgency('2026-11-20T00:00:00Z', '2026-11-05');
      expect(yellowEval.urgency).toBe('yellow');
      expect(yellowEval.status).toBe('urgent');
      expect(yellowEval.daysRemaining).toBe(15);

      // 1-7 days -> orange
      const orangeEval = evaluateCalendarUrgency('2026-11-09T00:00:00Z', '2026-11-05');
      expect(orangeEval.urgency).toBe('orange');
      expect(orangeEval.status).toBe('critical');
      expect(orangeEval.daysRemaining).toBe(4);

      // < 0 days -> red (overdue)
      const redEval = evaluateCalendarUrgency('2026-11-01T00:00:00Z', '2026-11-05');
      expect(redEval.urgency).toBe('red');
      expect(redEval.status).toBe('expired');
      expect(redEval.daysRemaining).toBe(-4);
    });
  });

  describe('Alerts Worker Lifecycle & Deduplication (Step 165.2)', () => {
    it('dispatches alert when threshold is crossed and prevents duplicate dispatch at same threshold', async () => {
      const eventId = 'event_pci_renewal_001';
      seedComplianceCalendarEvent({
        id: eventId,
        tenantId,
        eventName: 'Annual PCI SAQ A Attestation Renewal',
        category: 'pci_saq_renewal',
        expiryDate: '2026-11-12T00:00:00Z', // 7 days from 2026-11-05
        assignedTo: '00000000-0000-4000-8000-000000000001',
        status: 'active',
        notificationLeadDays: [90, 60, 30, 7],
        notes: 'Annual QSA review packet',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      // First run: crosses 7-day threshold -> must dispatch alert
      const firstRun = await runComplianceCalendarExpiryAlertsJob({
        tenantId,
        currentDateStr: '2026-11-05',
        officerEmail,
      });

      expect(firstRun.inspectedEventsCount).toBe(1);
      expect(firstRun.alertsDispatchedCount).toBe(1);
      expect(firstRun.criticalEventsCount).toBe(1);

      const stored = getComplianceCalendarEvent(eventId);
      expect(stored?.lastAlertThreshold).toBe(7);
      expect(stored?.status).toBe('critical');

      // Second run on same day: threshold 7 already processed -> must NOT duplicate
      const secondRun = await runComplianceCalendarExpiryAlertsJob({
        tenantId,
        currentDateStr: '2026-11-05',
        officerEmail,
      });

      expect(secondRun.inspectedEventsCount).toBe(1);
      expect(secondRun.alertsDispatchedCount).toBe(0);
    });

    it('ignores events already marked as renewed', async () => {
      seedComplianceCalendarEvent({
        id: 'event_renewed_002',
        tenantId,
        eventName: 'FinCEN SAR Annual Compliance Filing',
        category: 'sar_deadline',
        expiryDate: '2026-11-02T00:00:00Z',
        assignedTo: '00000000-0000-4000-8000-000000000001',
        status: 'renewed', // Already renewed
        notificationLeadDays: [30, 7],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      const summary = await runComplianceCalendarExpiryAlertsJob({
        tenantId,
        currentDateStr: '2026-11-05',
        officerEmail,
      });

      expect(summary.inspectedEventsCount).toBe(0);
      expect(summary.alertsDispatchedCount).toBe(0);
    });
  });
});
