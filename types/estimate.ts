// path: types/estimate.ts

export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'converted'
  | 'void';

export interface EstimateItem {
  id: string;
  tenantId: string;
  estimateId: string;
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

export interface EstimateSignature {
  id: string;
  tenantId: string;
  estimateId: string;
  signerName: string;
  signerEmail: string;
  consentCheckbox: boolean;
  signedAt: string;
  ipAddress: string;
  userAgent: string;
  documentHash: string;
  signatureData: string;
  createdAt: string;
}

export interface Estimate {
  id: string;
  tenantId: string;
  companyId: string;
  clientId?: string | undefined;
  clientName: string;
  clientEmail: string;
  estimateNumber: string;
  status: EstimateStatus;
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  issueDate: string;
  expiresAt: string;
  notes?: string | undefined;
  terms?: string | undefined;
  convertedInvoiceId?: string | undefined;
  signature?: EstimateSignature | undefined;
  items?: EstimateItem[] | undefined;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | undefined;
  version: number;
}
