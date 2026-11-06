// path: lib/invoices/numbering.ts

import { logger } from '@/lib/logger/logger';

const companyInvoiceCounters = new Map<string, number>();

/**
 * Step 186.2: Generates the next sequential invoice number for a company tenant.
 * Section 13 / Step 186: "Sequential numbering generator using PostgreSQL sequences or atomic company counters... custom prefix support."
 */
export function generateNextInvoiceNumber(input: {
  tenantId: string;
  companyId: string;
  prefix?: string | undefined;
  padLength?: number | undefined;
}): string {
  const prefix = input.prefix ?? 'INV-';
  const padLength = input.padLength ?? 4;
  const key = `${input.tenantId}:${input.companyId}:${prefix}`;

  const currentCount = companyInvoiceCounters.get(key) ?? 0;
  const nextCount = currentCount + 1;
  companyInvoiceCounters.set(key, nextCount);

  const formattedNumber = `${prefix}${String(nextCount).padStart(padLength, '0')}`;

  logger.info('Generated sequential invoice number', {
    companyId: input.companyId,
    invoiceNumber: formattedNumber,
    sequence: nextCount,
  });

  return formattedNumber;
}

export function peekCurrentInvoiceSequence(tenantId: string, companyId: string, prefix = 'INV-'): number {
  return companyInvoiceCounters.get(`${tenantId}:${companyId}:${prefix}`) ?? 0;
}

export function resetInvoiceNumberingStore(): void {
  companyInvoiceCounters.clear();
}
