// path: lib/invoices/totals.ts

import { Money } from '@/lib/money';

export interface RawLineItemInput {
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  discount?: string | number | undefined;
  taxAmount?: string | number | undefined;
  sortOrder?: number | undefined;
}

export interface ComputedLineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxAmount: string;
  total: string;
  sortOrder: number;
}

export interface ComputedInvoiceTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  remainingBalance: string;
  items: ComputedLineItem[];
}

/**
 * Step 187.2: Calculates line items and invoice totals using numeric(18,4) Decimal math.
 * Conserves penny precision with Banker's rounding (HALF_EVEN).
 */
export function calculateInvoiceTotals(
  items: RawLineItemInput[],
  amountPaid: string | number = '0.0000',
  overallInvoiceDiscount: string | number = '0.0000'
): ComputedInvoiceTotals {
  let subtotalMoney = Money.zero();
  let lineDiscountsMoney = Money.zero();
  let taxTotalMoney = Money.zero();

  const computedItems: ComputedLineItem[] = items.map((item, index) => {
    const qty = Money.from(item.quantity);
    const price = Money.from(item.unitPrice);
    const disc = Money.from(item.discount ?? '0.0000');
    const tax = Money.from(item.taxAmount ?? '0.0000');

    const gross = qty.multiply(price.value);
    const itemTotal = gross.subtract(disc).add(tax);

    subtotalMoney = subtotalMoney.add(gross);
    lineDiscountsMoney = lineDiscountsMoney.add(disc);
    taxTotalMoney = taxTotalMoney.add(tax);

    return {
      description: item.description,
      quantity: qty.toNumericString(),
      unitPrice: price.toNumericString(),
      discount: disc.toNumericString(),
      taxAmount: tax.toNumericString(),
      total: itemTotal.toNumericString(),
      sortOrder: item.sortOrder ?? index,
    };
  });

  const invoiceDiscountMoney = Money.from(overallInvoiceDiscount);
  const totalDiscountMoney = lineDiscountsMoney.add(invoiceDiscountMoney);

  // Grand Total = subtotal - totalDiscount + taxTotal
  const totalMoney = subtotalMoney.subtract(totalDiscountMoney).add(taxTotalMoney);
  const paidMoney = Money.from(amountPaid);

  let remainingMoney = totalMoney.subtract(paidMoney);
  if (remainingMoney.isNegative()) {
    remainingMoney = Money.zero();
  }

  return {
    subtotal: subtotalMoney.toNumericString(),
    discountTotal: totalDiscountMoney.toNumericString(),
    taxTotal: taxTotalMoney.toNumericString(),
    total: totalMoney.toNumericString(),
    remainingBalance: remainingMoney.toNumericString(),
    items: computedItems,
  };
}
