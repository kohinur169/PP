// path: lib/invoices/recurring.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Invoice } from '@/types/invoice';
import { generateNextInvoiceNumber } from './numbering';
import { saveInvoice } from './state-machine';

export type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'annually';

export interface RecurringScheduleRecord {
  id: string;
  tenantId: string;
  companyId: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amountUsd: string;
  cadence: RecurringCadence;
  nextRunDate: string; // YYYY-MM-DD
  isActive: boolean;
  autoSend: boolean;
  lastGeneratedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

const schedulesStore = new Map<string, RecurringScheduleRecord>();
const auditRepo = new AuditLogRepository();

/**
 * Step 194.4: Advances next run date accurately across month boundaries, leap years, and cadences.
 */
export function advanceScheduleNextRunDate(currentDateStr: string, cadence: RecurringCadence): string {
  const parts = currentDateStr.split('-').map(Number);
  const year = parts[0];
  const month = parts[1] - 1; // 0-indexed
  const day = parts[2];

  const date = new Date(Date.UTC(year, month, day));

  switch (cadence) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;

    case 'monthly': {
      const targetMonth = date.getUTCMonth() + 1;
      date.setUTCMonth(targetMonth);
      // If day overflowed (e.g. Jan 31 -> Mar 3), clamp to last day of February
      if (date.getUTCMonth() > (targetMonth % 12)) {
        date.setUTCDate(0);
      }
      break;
    }

    case 'quarterly': {
      const targetMonth = date.getUTCMonth() + 3;
      date.setUTCMonth(targetMonth);
      if (date.getUTCMonth() > (targetMonth % 12)) {
        date.setUTCDate(0);
      }
      break;
    }

    case 'annually': {
      const targetYear = date.getUTCFullYear() + 1;
      date.setUTCFullYear(targetYear);
      break;
    }
  }

  return date.toISOString().split('T')[0];
}

/**
 * Step 194.1: Registers a new recurring invoice schedule.
 */
export function registerRecurringSchedule(input: {
  tenantId: string;
  companyId: string;
  clientName: string;
  clientEmail: string;
  description: string;
  amountUsd: string;
  cadence: RecurringCadence;
  startDate: string;
  autoSend?: boolean | undefined;
}): RecurringScheduleRecord {
  const id = generateUuidV7();
  const now = new Date().toISOString();

  const record: RecurringScheduleRecord = {
    id,
    tenantId: input.tenantId,
    companyId: input.companyId,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    description: input.description,
    amountUsd: Number(input.amountUsd).toFixed(4),
    cadence: input.cadence,
    nextRunDate: input.startDate,
    isActive: true,
    autoSend: input.autoSend ?? true,
    createdAt: now,
    updatedAt: now,
  };

  schedulesStore.set(id, record);

  logger.info('Recurring invoice schedule registered', {
    scheduleId: id,
    companyId: input.companyId,
    cadence: input.cadence,
    nextRunDate: input.startDate,
  });

  return record;
}

/**
 * Step 194.2: Batch worker running daily to generate scheduled recurring invoices.
 */
export async function executeRecurringInvoiceBatch(
  runDateStr: string = new Date().toISOString().split('T')[0],
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Promise<{ generatedCount: number; invoices: Invoice[] }> {
  const generatedInvoices: Invoice[] = [];
  const now = new Date();

  for (const schedule of schedulesStore.values()) {
    if (!schedule.isActive) continue;

    if (schedule.nextRunDate <= runDateStr) {
      const invoiceId = generateUuidV7();
      const invoiceNumber = generateNextInvoiceNumber({
        tenantId: schedule.tenantId,
        companyId: schedule.companyId,
      });

      const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const invoice: Invoice = {
        id: invoiceId,
        tenantId: schedule.tenantId,
        companyId: schedule.companyId,
        clientName: schedule.clientName,
        clientEmail: schedule.clientEmail,
        invoiceNumber,
        status: schedule.autoSend ? 'sent' : 'draft',
        currency: 'USD',
        subtotal: schedule.amountUsd,
        discountTotal: '0.0000',
        taxTotal: '0.0000',
        total: schedule.amountUsd,
        amountPaid: '0.0000',
        remainingBalance: schedule.amountUsd,
        issueDate: schedule.nextRunDate,
        dueDate,
        notes: `Recurring ${schedule.cadence} invoice: ${schedule.description}`,
        isLocked: false,
        version: 1,
        items: [
          {
            id: generateUuidV7(),
            tenantId: schedule.tenantId,
            invoiceId,
            description: schedule.description,
            quantity: '1.0000',
            unitPrice: schedule.amountUsd,
            discount: '0.0000',
            taxAmount: '0.0000',
            total: schedule.amountUsd,
            sortOrder: 0,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        ],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      saveInvoice(invoice);
      generatedInvoices.push(invoice);

      // Advance schedule
      schedule.lastGeneratedAt = now.toISOString();
      schedule.nextRunDate = advanceScheduleNextRunDate(schedule.nextRunDate, schedule.cadence);
      schedule.updatedAt = now.toISOString();

      logger.info('Recurring invoice generated by batch worker', {
        scheduleId: schedule.id,
        invoiceId,
        invoiceNumber,
        advancedNextRunDate: schedule.nextRunDate,
      });

      try {
        await auditRepo.append({
          actor_id: actorId,
          action: 'RECURRING_INVOICE_GENERATED',
          entity_type: 'invoice',
          entity_id: invoiceId,
          payload: {
            scheduleId: schedule.id,
            invoiceNumber,
            amount: schedule.amountUsd,
            cadence: schedule.cadence,
          },
        });
      } catch {}
    }
  }

  return { generatedCount: generatedInvoices.length, invoices: generatedInvoices };
}

export function resetRecurringSchedulesStore(): void {
  schedulesStore.clear();
}
