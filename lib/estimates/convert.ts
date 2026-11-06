// path: lib/estimates/convert.ts

import crypto from 'crypto';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Estimate } from '@/types/estimate';
import type { Invoice, InvoiceItem } from '@/types/invoice';
import { generateNextInvoiceNumber } from '@/lib/invoices/numbering';
import { saveInvoice } from '@/lib/invoices/state-machine';

export class UnacceptedEstimateConversionError extends Error {
  constructor(estimateNumber: string, status: string) {
    super(`Cannot convert estimate '${estimateNumber}' to invoice: status is '${status}', must be 'accepted'.`);
    this.name = 'UnacceptedEstimateConversionError';
  }
}

const auditRepo = new AuditLogRepository();

/**
 * Step 193: Estimate-to-Invoice Conversion & Payment Link Auto-Generation
 */
export async function convertEstimateToInvoice(
  estimate: Estimate,
  dueDateDays = 14,
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Promise<{ invoice: Invoice; paymentLinkUrl: string; token: string }> {
  if (estimate.status !== 'accepted') {
    throw new UnacceptedEstimateConversionError(estimate.estimateNumber, estimate.status);
  }

  const invoiceId = generateUuidV7();
  const now = new Date();
  const dueDate = new Date(now.getTime() + dueDateDays * 24 * 60 * 60 * 1000);

  const invoiceNumber = generateNextInvoiceNumber({
    tenantId: estimate.tenantId,
    companyId: estimate.companyId,
  });

  const invoiceItems: InvoiceItem[] = (estimate.items ?? []).map((item, idx) => ({
    id: generateUuidV7(),
    tenantId: estimate.tenantId,
    invoiceId,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount,
    taxAmount: item.taxAmount,
    total: item.total,
    sortOrder: idx,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }));

  const invoice: Invoice = {
    id: invoiceId,
    tenantId: estimate.tenantId,
    companyId: estimate.companyId,
    clientId: estimate.clientId,
    clientName: estimate.clientName,
    clientEmail: estimate.clientEmail,
    invoiceNumber,
    status: 'sent',
    currency: estimate.currency,
    subtotal: estimate.subtotal,
    discountTotal: estimate.discountTotal,
    taxTotal: estimate.taxTotal,
    total: estimate.total,
    amountPaid: '0.0000',
    remainingBalance: estimate.total,
    issueDate: now.toISOString().split('T')[0],
    dueDate: dueDate.toISOString().split('T')[0],
    notes: estimate.notes ? `${estimate.notes} (Converted from Estimate #${estimate.estimateNumber})` : `Converted from Estimate #${estimate.estimateNumber}`,
    terms: estimate.terms,
    isLocked: false,
    items: invoiceItems,
    version: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  saveInvoice(invoice);

  // Generate high-entropy secure client token
  const token = crypto.randomBytes(32).toString('hex');
  const paymentLinkUrl = `/i/${token}`;

  estimate.convertedInvoiceId = invoiceId;
  estimate.status = 'converted';
  estimate.updatedAt = now.toISOString();
  estimate.version += 1;

  logger.info('Estimate converted into invoice with auto-generated payment link', {
    estimateId: estimate.id,
    estimateNumber: estimate.estimateNumber,
    invoiceId,
    invoiceNumber,
    paymentLinkUrl,
  });

  try {
    await auditRepo.append({
      actor_id: actorId,
      action: 'ESTIMATE_CONVERTED_TO_INVOICE',
      entity_type: 'estimate',
      entity_id: estimate.id,
      payload: {
        estimateNumber: estimate.estimateNumber,
        invoiceId,
        invoiceNumber,
        total: invoice.total,
      },
    });
  } catch {}

  return { invoice, paymentLinkUrl, token };
}
