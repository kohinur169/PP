// path: types/invoice.ts

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void';

export interface InvoiceItem {
  id: string;
  tenantId: string;
  invoiceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxAmount: string;
  total: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  companyId: string;
  clientId?: string | undefined;
  clientName: string;
  clientEmail: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  amountPaid: string;
  remainingBalance: string;
  issueDate: string;
  dueDate: string;
  notes?: string | undefined;
  terms?: string | undefined;
  isLocked: boolean;
  items?: InvoiceItem[] | undefined;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | undefined;
  version: number;
}
