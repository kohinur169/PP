// path: lib/invoices/partial-payments.ts

import { Money } from '@/lib/money';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';
import type { Invoice } from '@/types/invoice';
import { transitionInvoiceStatus, LockedInvoiceError } from './state-machine';

export const MINIMUM_PARTIAL_PAYMENT_USD = '20.0000';

export class MinimumPartialPaymentError extends Error {
  constructor(attemptedAmount: string) {
    super(
      `Partial payment rejected: attempted amount $${attemptedAmount} is below mandatory minimum threshold of USD $${MINIMUM_PARTIAL_PAYMENT_USD}.`
    );
    this.name = 'MinimumPartialPaymentError';
  }
}

export class ExcessPaymentAmountError extends Error {
  constructor(attempted: string, remaining: string) {
    super(`Payment amount $${attempted} exceeds remaining invoice balance of $${remaining}.`);
    this.name = 'ExcessPaymentAmountError';
  }
}

const auditRepo = new AuditLogRepository();

/**
 * Step 189: Partial Payment Acceptance Engine (Minimum USD $20 Threshold)
 * Section 13 / Step 189: "Build partial payment engine allowing installment payments with mandatory minimum of USD $20 per payment."
 */
export async function processInvoicePartialPayment(
  invoice: Invoice,
  paymentAmountInput: string | number,
  actorId: string = '00000000-0000-4000-8000-000000000000'
): Promise<{
  invoice: Invoice;
  paymentAmount: string;
  previousBalance: string;
  newRemainingBalance: string;
  isFullyPaid: boolean;
}> {
  if (invoice.isLocked || invoice.status === 'paid' || invoice.status === 'void') {
    throw new LockedInvoiceError(invoice.invoiceNumber);
  }

  const paymentMoney = Money.from(paymentAmountInput);
  const minThresholdMoney = Money.from(MINIMUM_PARTIAL_PAYMENT_USD);
  const remainingMoney = Money.from(invoice.remainingBalance);

  // If paying the exact full remaining balance and remaining balance is less than $20 (e.g. final penny clearance), allow final settlement
  const isFinalSettlement = paymentMoney.equals(remainingMoney);

  if (!isFinalSettlement && paymentMoney.lessThan(minThresholdMoney)) {
    throw new MinimumPartialPaymentError(paymentMoney.toNumericString());
  }

  if (paymentMoney.greaterThan(remainingMoney)) {
    throw new ExcessPaymentAmountError(paymentMoney.toNumericString(), remainingMoney.toNumericString());
  }

  const previousBalance = invoice.remainingBalance;
  const currentPaidMoney = Money.from(invoice.amountPaid);
  const newAmountPaidMoney = currentPaidMoney.add(paymentMoney);
  const newRemainingMoney = remainingMoney.subtract(paymentMoney);

  invoice.amountPaid = newAmountPaidMoney.toNumericString();
  invoice.remainingBalance = newRemainingMoney.toNumericString();
  invoice.updatedAt = new Date().toISOString();
  invoice.version += 1;

  const isFullyPaid = newRemainingMoney.isZero();

  if (isFullyPaid) {
    await transitionInvoiceStatus(invoice, 'paid', actorId);
  } else {
    if (invoice.status !== 'partially_paid') {
      await transitionInvoiceStatus(invoice, 'partially_paid', actorId);
    }
  }

  logger.info('Invoice partial payment processed', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    paymentAmount: paymentMoney.toNumericString(),
    remainingBalance: invoice.remainingBalance,
    isFullyPaid,
  });

  try {
    await auditRepo.append({
      actor_id: actorId,
      action: 'INVOICE_PARTIAL_PAYMENT_PROCESSED',
      entity_type: 'invoice',
      entity_id: invoice.id,
      payload: {
        invoiceNumber: invoice.invoiceNumber,
        paymentAmount: paymentMoney.toNumericString(),
        previousBalance,
        newRemainingBalance: invoice.remainingBalance,
        isFullyPaid,
      },
    });
  } catch {}

  return {
    invoice,
    paymentAmount: paymentMoney.toNumericString(),
    previousBalance,
    newRemainingBalance: invoice.remainingBalance,
    isFullyPaid,
  };
}
