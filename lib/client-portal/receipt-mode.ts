// path: lib/client-portal/receipt-mode.ts

import { logger } from '@/lib/logger/logger';
import type { Invoice } from '@/types/invoice';
import { Money } from '@/lib/money';

export class InvoiceAlreadyPaidError extends Error {
  constructor(invoiceNumber: string) {
    super(`Invoice '${invoiceNumber}' has already been fully paid. Payment form is permanently locked.`);
    this.name = 'InvoiceAlreadyPaidError';
  }
}

export interface ClientPortalInvoiceView {
  invoiceId: string;
  invoiceNumber: string;
  status: Invoice['status'];
  isReceiptMode: boolean;
  canAcceptPayment: boolean;
  maxPayableAmount: string;
  total: string;
  amountPaid: string;
  remainingBalance: string;
  pdfDownloadUrl?: string | undefined;
  paymentTimestamp?: string | undefined;
}

/**
 * Step 197.1: Evaluates client invoice link view mode (interactive checkout vs read-only paid receipt).
 * Section 13 / Step 197: "Paid Invoice Link Locking & Receipt Mode Enforcement"
 */
export function evaluateInvoicePortalView(invoice: Invoice): ClientPortalInvoiceView {
  const isFullyPaid = invoice.status === 'paid' || Money.from(invoice.remainingBalance).isZero();

  if (isFullyPaid) {
    logger.info('Invoice in read-only receipt mode', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: 'paid',
      isReceiptMode: true,
      canAcceptPayment: false,
      maxPayableAmount: '0.0000',
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      remainingBalance: '0.0000',
      pdfDownloadUrl: `/api/files/invoices/${invoice.id}/receipt.pdf`,
      paymentTimestamp: invoice.updatedAt,
    };
  }

  // Active / Partially paid
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    isReceiptMode: false,
    canAcceptPayment: true,
    maxPayableAmount: invoice.remainingBalance,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    remainingBalance: invoice.remainingBalance,
  };
}

/**
 * Step 197.3 & 197.4: Validates incoming checkout submission against portal state.
 * Rejects submission on paid invoice with HTTP 400 InvoiceAlreadyPaidError. Clamps to remaining balance.
 */
export function validatePortalPaymentSubmission(
  invoice: Invoice,
  attemptedAmount: string | number
): {
  isPermitted: boolean;
  clampedAmount: string;
} {
  if (invoice.status === 'paid' || Money.from(invoice.remainingBalance).isZero()) {
    throw new InvoiceAlreadyPaidError(invoice.invoiceNumber);
  }

  const attemptedMoney = Money.from(attemptedAmount);
  const remainingMoney = Money.from(invoice.remainingBalance);

  if (attemptedMoney.greaterThan(remainingMoney)) {
    throw new Error(
      `Payment amount $${attemptedMoney.toNumericString()} exceeds remaining invoice balance of $${remainingMoney.toNumericString()}.`
    );
  }

  return {
    isPermitted: true,
    clampedAmount: attemptedMoney.toNumericString(),
  };
}
