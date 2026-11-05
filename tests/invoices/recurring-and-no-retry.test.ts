// path: tests/invoices/recurring-and-no-retry.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  advanceScheduleNextRunDate,
  registerRecurringSchedule,
  executeRecurringInvoiceBatch,
  resetRecurringSchedulesStore,
} from '@/lib/invoices/recurring';
import {
  handleFailedRecurringPayment,
  getInvoiceReminders,
  resetInvoiceRemindersStore,
} from '@/lib/invoices/reminders';
import { resetInvoiceNumberingStore } from '@/lib/invoices/numbering';
import type { Invoice } from '@/types/invoice';

describe('Recurring Invoices & Non-Retry Policy Engine (Phase 13 - Steps 194-195)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';

  beforeEach(() => {
    resetRecurringSchedulesStore();
    resetInvoiceRemindersStore();
    resetInvoiceNumberingStore();
  });

  describe('Step 194: Recurring Invoice Schedule Engine & Batch Generator', () => {
    it('advances next run date accurately across cadences and month boundaries', () => {
      // Weekly
      expect(advanceScheduleNextRunDate('2026-11-01', 'weekly')).toBe('2026-11-08');

      // Monthly standard
      expect(advanceScheduleNextRunDate('2026-05-15', 'monthly')).toBe('2026-06-15');

      // Monthly month-end clamping (Jan 31 -> Feb 28)
      expect(advanceScheduleNextRunDate('2026-01-31', 'monthly')).toBe('2026-02-28');

      // Quarterly
      expect(advanceScheduleNextRunDate('2026-01-10', 'quarterly')).toBe('2026-04-10');

      // Annually
      expect(advanceScheduleNextRunDate('2026-06-01', 'annually')).toBe('2027-06-01');
    });

    it('generates invoices on schedule and advances next run date', async () => {
      registerRecurringSchedule({
        tenantId,
        companyId,
        clientName: 'SaaS Subscriber A',
        clientEmail: 'suba@subscriber.test',
        description: 'Monthly Cloud Platform Pro Plan',
        amountUsd: '79.00',
        cadence: 'monthly',
        startDate: '2026-11-01',
      });

      // Run batch for 2026-11-05 (due date passed)
      const batchResult = await executeRecurringInvoiceBatch('2026-11-05');

      expect(batchResult.generatedCount).toBe(1);
      const generated = batchResult.invoices[0];
      expect(generated.invoiceNumber).toBe('INV-0001');
      expect(generated.total).toBe('79.0000');
      expect(generated.issueDate).toBe('2026-11-01');

      // Running again on the same day should generate 0 because schedule was advanced to 2026-12-01
      const rerun = await executeRecurringInvoiceBatch('2026-11-05');
      expect(rerun.generatedCount).toBe(0);
    });
  });

  describe('Step 195: Non-Retry Failed Recurring Payment Policy & Client Reminder Queue', () => {
    function makeTestInvoice(): Invoice {
      return {
        id: '01a1ac37-0000-7000-8000-000000000001',
        tenantId,
        companyId,
        clientName: 'Acme Media',
        clientEmail: 'billing@acmemedia.test',
        invoiceNumber: 'INV-2026-8888',
        status: 'sent',
        currency: 'USD',
        subtotal: '250.0000',
        discountTotal: '0.0000',
        taxTotal: '0.0000',
        total: '250.0000',
        amountPaid: '0.0000',
        remainingBalance: '250.0000',
        issueDate: '2026-11-01',
        dueDate: '2026-11-05',
        isLocked: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    it('enforces non-retry policy: sets overdue, forbids card retry loop, enqueues +1, +3, +7 reminders', async () => {
      const invoice = makeTestInvoice();

      const result = await handleFailedRecurringPayment(
        invoice,
        'Card expired or insufficient funds'
      );

      expect(result.status).toBe('overdue');
      expect(result.automatedCardRetryAttempted).toBe(false); // FORBIDDEN! Zero re-charge loop
      expect(result.remindersEnqueuedCount).toBe(3);
      expect(invoice.status).toBe('overdue');
      expect(invoice.notes).toContain('Overdue immediately per non-retry policy');

      const reminders = getInvoiceReminders(invoice.id);
      expect(reminders).toHaveLength(3);

      expect(reminders[0].reminderStep).toBe(1);
      expect(reminders[0].scheduledFor).toBe('2026-11-06'); // +1 day from 2026-11-05

      expect(reminders[1].reminderStep).toBe(3);
      expect(reminders[1].scheduledFor).toBe('2026-11-08'); // +3 days

      expect(reminders[2].reminderStep).toBe(7);
      expect(reminders[2].scheduledFor).toBe('2026-11-12'); // +7 days
    });
  });
});
