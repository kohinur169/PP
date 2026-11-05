// path: lib/invoices/reminders.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Invoice } from '@/types/invoice';
import { transitionInvoiceStatus } from './state-machine';

export interface InvoiceReminderRecord {
  id: string;
  tenantId: string;
  companyId: string;
  invoiceId: string;
  reminderStep: 1 | 3 | 7;
  scheduledFor: string; // YYYY-MM-DD
  status: 'pending' | 'sent' | 'canceled';
  sentAt?: string | undefined;
  createdAt: string;
}

export interface FailedPaymentHandlingResult {
  invoiceId: string;
  invoiceNumber: string;
  status: 'overdue';
  automatedCardRetryAttempted: false;
  remindersEnqueuedCount: number;
  reminders: InvoiceReminderRecord[];
  merchantActionRequired: string;
}

const remindersStore = new Map<string, InvoiceReminderRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 195: Non-Retry Failed Recurring Payment Policy & Client Reminder Queue
 * Strictly enforces zero automated card re-charge attempts upon initial failure.
 */
export async function handleFailedRecurringPayment(
  invoice: Invoice,
  failureReason: string,
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Promise<FailedPaymentHandlingResult> {
  // 1. Immediately transition invoice to overdue
  invoice.status = 'overdue';
  invoice.notes = invoice.notes
    ? `${invoice.notes}\n[PAYMENT FAILED: ${failureReason} - Overdue immediately per non-retry policy]`
    : `[PAYMENT FAILED: ${failureReason} - Overdue immediately per non-retry policy]`;
  invoice.updatedAt = new Date().toISOString();
  invoice.version += 1;

  const dueDate = new Date(invoice.dueDate);
  const reminderSteps: (1 | 3 | 7)[] = [1, 3, 7];
  const enqueuedReminders: InvoiceReminderRecord[] = [];
  const now = new Date().toISOString();

  // 2. Enqueue structured client reminder emails at +1, +3, +7 days
  for (const step of reminderSteps) {
    const scheduledDate = new Date(dueDate.getTime() + step * 24 * 60 * 60 * 1000);
    const reminderId = generateUuidV7();

    const reminder: InvoiceReminderRecord = {
      id: reminderId,
      tenantId: invoice.tenantId,
      companyId: invoice.companyId,
      invoiceId: invoice.id,
      reminderStep: step,
      scheduledFor: scheduledDate.toISOString().split('T')[0],
      status: 'pending',
      createdAt: now,
    };

    remindersStore.set(reminderId, reminder);
    enqueuedReminders.push(reminder);
  }

  logger.warn('Recurring payment failed: Non-retry policy enforced, zero re-charge attempts, reminders queued', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    failureReason,
    remindersCount: enqueuedReminders.length,
  });

  try {
    await auditRepo.append({
      actor_id: actorId,
      action: 'RECURRING_PAYMENT_FAILED_NON_RETRY',
      entity_type: 'invoice',
      entity_id: invoice.id,
      payload: {
        invoiceNumber: invoice.invoiceNumber,
        failureReason,
        automatedRetry: false,
        remindersScheduled: reminderSteps,
      },
    });
  } catch {}

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: 'overdue',
    automatedCardRetryAttempted: false,
    remindersEnqueuedCount: enqueuedReminders.length,
    reminders: enqueuedReminders,
    merchantActionRequired: `Invoice #${invoice.invoiceNumber} failed payment. Please contact client ${invoice.clientEmail} or wait for automated reminder link checkout.`,
  };
}

export function getInvoiceReminders(invoiceId: string): InvoiceReminderRecord[] {
  return Array.from(remindersStore.values()).filter((r) => r.invoiceId === invoiceId);
}

export function resetInvoiceRemindersStore(): void {
  remindersStore.clear();
}
