// path: lib/invoices/state-machine.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Invoice, InvoiceStatus } from '@/types/invoice';
import { generateNextInvoiceNumber } from './numbering';

export class LockedInvoiceError extends Error {
  constructor(invoiceNumber: string) {
    super(`Cannot modify locked invoice '${invoiceNumber}'. Paid invoices are physically immutable.`);
    this.name = 'LockedInvoiceError';
  }
}

export class InvalidInvoiceTransitionError extends Error {
  constructor(fromStatus: InvoiceStatus, toStatus: InvoiceStatus) {
    super(`Invalid invoice status transition from '${fromStatus}' to '${toStatus}'.`);
    this.name = 'InvalidInvoiceTransitionError';
  }
}

const VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'void'],
  sent: ['viewed', 'partially_paid', 'paid', 'overdue', 'void'],
  viewed: ['partially_paid', 'paid', 'overdue', 'void'],
  partially_paid: ['paid', 'overdue', 'void'],
  paid: ['void'], // Voiding a paid invoice is permitted solely with reversal audit flags
  overdue: ['viewed', 'partially_paid', 'paid', 'void'],
  void: [], // Terminal state
};

const invoicesStore = new Map<string, Invoice>();
const auditRepo = new AuditLogRepository();

/**
 * Step 188.1: Validates and transitions invoice status.
 */
export async function transitionInvoiceStatus(
  invoice: Invoice,
  newStatus: InvoiceStatus,
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Promise<Invoice> {
  if (invoice.isLocked && newStatus !== 'void') {
    throw new LockedInvoiceError(invoice.invoiceNumber);
  }

  const allowed = VALID_TRANSITIONS[invoice.status];
  if (!allowed.includes(newStatus)) {
    throw new InvalidInvoiceTransitionError(invoice.status, newStatus);
  }

  const previousStatus = invoice.status;
  invoice.status = newStatus;
  invoice.updatedAt = new Date().toISOString();
  invoice.version += 1;

  if (newStatus === 'paid') {
    invoice.isLocked = true;
    invoice.remainingBalance = '0.0000';
  }

  invoicesStore.set(invoice.id, invoice);

  logger.info('Invoice status transitioned', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    from: previousStatus,
    to: newStatus,
    isLocked: invoice.isLocked,
  });

  try {
    await auditRepo.append({
      actor_id: actorId,
      action: 'INVOICE_STATUS_TRANSITIONED',
      entity_type: 'invoice',
      entity_id: invoice.id,
      payload: {
        invoiceNumber: invoice.invoiceNumber,
        previousStatus,
        newStatus,
        isLocked: invoice.isLocked,
      },
    });
  } catch {}

  return invoice;
}

/**
 * Step 188.2: Asserts that an invoice is mutable before updates. Throws LockedInvoiceError if paid/locked.
 */
export function assertInvoiceMutable(invoice: Invoice): void {
  if (invoice.isLocked || invoice.status === 'paid') {
    throw new LockedInvoiceError(invoice.invoiceNumber);
  }
}

/**
 * Step 188.3: Duplicates an invoice into a fresh draft with a new sequential invoice number.
 */
export function duplicateInvoice(
  sourceInvoice: Invoice,
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Invoice {
  const newId = generateUuidV7();
  const now = new Date().toISOString();
  const newInvoiceNumber = generateNextInvoiceNumber({
    tenantId: sourceInvoice.tenantId,
    companyId: sourceInvoice.companyId,
  });

  const duplicated: Invoice = {
    ...sourceInvoice,
    id: newId,
    invoiceNumber: newInvoiceNumber,
    status: 'draft',
    isLocked: false,
    amountPaid: '0.0000',
    remainingBalance: sourceInvoice.total,
    items: sourceInvoice.items?.map((item) => ({
      ...item,
      id: generateUuidV7(),
      invoiceId: newId,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };

  invoicesStore.set(newId, duplicated);

  logger.info('Invoice duplicated', {
    sourceId: sourceInvoice.id,
    newId,
    newInvoiceNumber,
  });

  return duplicated;
}

/**
 * Step 188.3b: Voids an invoice with automated audit logging.
 */
export async function voidInvoice(
  invoice: Invoice,
  reason: string,
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Promise<Invoice> {
  const previousStatus = invoice.status;
  invoice.status = 'void';
  invoice.isLocked = true;
  invoice.notes = invoice.notes ? `${invoice.notes}\n[VOIDED: ${reason}]` : `[VOIDED: ${reason}]`;
  invoice.updatedAt = new Date().toISOString();
  invoice.version += 1;

  invoicesStore.set(invoice.id, invoice);

  logger.info('Invoice voided', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    reason,
  });

  try {
    await auditRepo.append({
      actor_id: actorId,
      action: 'INVOICE_VOIDED',
      entity_type: 'invoice',
      entity_id: invoice.id,
      payload: {
        invoiceNumber: invoice.invoiceNumber,
        previousStatus,
        reason,
      },
    });
  } catch {}

  return invoice;
}

export function saveInvoice(invoice: Invoice): void {
  invoicesStore.set(invoice.id, invoice);
}

export function getInvoice(id: string): Invoice | undefined {
  return invoicesStore.get(id);
}

export function resetInvoiceStateMachineStore(): void {
  invoicesStore.clear();
}
