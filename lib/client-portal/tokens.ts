// path: lib/client-portal/tokens.ts

import crypto from 'node:crypto';
import { checkRateLimit, RateLimitResult } from '@/lib/security/rate-limit';
import { AuditLogRepository } from '@/lib/db/audit';
import { logger } from '@/lib/logger';

export const TOKEN_PORTAL_RATE_LIMIT = 30; // Max 30 attempts per minute per IP to defend against brute force
export const TOKEN_PORTAL_WINDOW_SECONDS = 60;

export interface InvoiceLineItem {
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceUsd: number;
  readonly totalUsd: number;
}

export interface PaymentReceipt {
  readonly receiptNumber: string;
  readonly chargeId: string;
  readonly paidAmountUsd: number;
  readonly paidAt: string;
  readonly paymentMethod: string;
  readonly last4: string;
}

export interface TokenizedInvoice {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly clientName: string;
  readonly clientEmail: string;
  readonly subtotalUsd: number;
  readonly taxAmountUsd: number;
  readonly totalAmountUsd: number;
  status: 'issued' | 'paid' | 'overdue' | 'voided';
  readonly lineItems: InvoiceLineItem[];
  readonly token: string;
  readonly tokenExpiresAt: string;
  paidAt?: string | undefined;
  paymentReceipt?: PaymentReceipt | undefined;
}

export interface EstimateLineItem {
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceUsd: number;
  readonly totalUsd: number;
}

export interface TokenizedEstimate {
  readonly id: string;
  readonly estimateNumber: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly clientName: string;
  readonly clientEmail: string;
  readonly totalAmountUsd: number;
  status: 'sent' | 'accepted' | 'declined' | 'expired';
  readonly lineItems: EstimateLineItem[];
  readonly token: string;
  readonly tokenExpiresAt: string;
  acceptedAt?: string | undefined;
  signatureDataUrl?: string | undefined;
  signerIp?: string | undefined;
}

// In-memory registries for tokenized documents
const invoiceRegistry = new Map<string, TokenizedInvoice>();
const estimateRegistry = new Map<string, TokenizedEstimate>();

/**
 * Resets stores for test isolation.
 */
export function resetTokenizedPortalDataForTest(): void {
  invoiceRegistry.clear();
  estimateRegistry.clear();
}

/**
 * Seeds a tokenized invoice.
 */
export function seedTokenizedInvoiceForTest(invoice: TokenizedInvoice): void {
  invoiceRegistry.set(invoice.token, {
    ...invoice,
    lineItems: [...invoice.lineItems],
  });
}

/**
 * Seeds a tokenized estimate.
 */
export function seedTokenizedEstimateForTest(estimate: TokenizedEstimate): void {
  estimateRegistry.set(estimate.token, {
    ...estimate,
    lineItems: [...estimate.lineItems],
  });
}

/**
 * Generates a high-entropy URL-safe cryptographic token (32 bytes = 256 bits).
 */
export function generateHighEntropyToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Step 073.4: Enforces IP rate limiting on tokenized endpoints to defend against scanning.
 */
export function enforceTokenRateLimit(clientIp: string): RateLimitResult {
  const result = checkRateLimit(`token_portal:${clientIp}`, {
    limit: TOKEN_PORTAL_RATE_LIMIT,
    windowSeconds: TOKEN_PORTAL_WINDOW_SECONDS,
  });

  if (!result.allowed) {
    logger.warn('Token endpoint rate limit exceeded by client IP', {
      clientIp,
      retryAfterSeconds: result.retryAfterSeconds,
    });
    throw new Error(
      `Too Many Requests: Rate limit exceeded. Please wait ${result.retryAfterSeconds} seconds.`
    );
  }

  return result;
}

/**
 * Step 073.1: Verifies token and retrieves invoice details.
 */
export async function verifyInvoiceToken(
  token: string,
  clientIp: string = '127.0.0.1'
): Promise<TokenizedInvoice> {
  enforceTokenRateLimit(clientIp);

  const invoice = invoiceRegistry.get(token);
  if (!invoice) {
    logger.warn('Invalid or unknown invoice token lookup attempted', { tokenPrefix: token.slice(0, 8), clientIp });
    throw new Error('Invoice not found: Invalid, expired, or revoked document token.');
  }

  const nowMs = Date.now();
  const expiresMs = new Date(invoice.tokenExpiresAt).getTime();
  if (nowMs > expiresMs) {
    logger.warn('Expired invoice token accessed', { invoiceId: invoice.id, clientIp });
    throw new Error('Invoice link has expired. Please contact the merchant for a new payment link.');
  }

  return {
    ...invoice,
    lineItems: [...invoice.lineItems],
  };
}

/**
 * Step 073.3: Pays a tokenized invoice, locks document to read-only state, and generates receipt.
 */
export async function payTokenizedInvoice(params: {
  readonly token: string;
  readonly paymentMethod: { type: string; last4: string };
  readonly clientIp?: string | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<TokenizedInvoice> {
  const { token, paymentMethod, clientIp = '127.0.0.1', auditRepo } = params;

  enforceTokenRateLimit(clientIp);

  const invoice = invoiceRegistry.get(token);
  if (!invoice) {
    throw new Error('Invoice not found: Invalid document token.');
  }

  if (invoice.status === 'paid') {
    throw new Error('Invoice is already paid in full. No additional payment required.');
  }

  if (invoice.status === 'voided') {
    throw new Error('This invoice has been voided by the merchant.');
  }

  const paidAt = new Date().toISOString();
  const receiptNumber = `RCP-${invoice.invoiceNumber.replace(/^INV-/, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  const chargeId = `ch_${crypto.randomUUID()}`;

  const receipt: PaymentReceipt = {
    receiptNumber,
    chargeId,
    paidAmountUsd: invoice.totalAmountUsd,
    paidAt,
    paymentMethod: paymentMethod.type,
    last4: paymentMethod.last4,
  };

  invoice.status = 'paid';
  invoice.paidAt = paidAt;
  invoice.paymentReceipt = receipt;

  invoiceRegistry.set(token, invoice);

  logger.info('Tokenized invoice paid successfully by customer', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amountUsd: invoice.totalAmountUsd,
    receiptNumber,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: invoice.companyId,
      actor_id: '00000000-0000-7000-8000-000000000000', // External customer / unauthenticated token actor
      action: 'INVOICE_PAID',
      entity_type: 'invoice',
      entity_id: invoice.id,
      payload: {
        invoiceNumber: invoice.invoiceNumber,
        receiptNumber,
        chargeId,
        amountUsd: invoice.totalAmountUsd,
        paymentMethod: paymentMethod.type,
        clientIp,
      },
    });
  }

  return {
    ...invoice,
    lineItems: [...invoice.lineItems],
  };
}

/**
 * Step 073.2: Verifies token and retrieves estimate details for digital signing.
 */
export async function verifyEstimateToken(
  token: string,
  clientIp: string = '127.0.0.1'
): Promise<TokenizedEstimate> {
  enforceTokenRateLimit(clientIp);

  const estimate = estimateRegistry.get(token);
  if (!estimate) {
    logger.warn('Invalid or unknown estimate token lookup attempted', { tokenPrefix: token.slice(0, 8), clientIp });
    throw new Error('Estimate not found: Invalid, expired, or revoked document token.');
  }

  const nowMs = Date.now();
  const expiresMs = new Date(estimate.tokenExpiresAt).getTime();
  if (nowMs > expiresMs) {
    logger.warn('Expired estimate token accessed', { estimateId: estimate.id, clientIp });
    throw new Error('Estimate link has expired. Please contact the merchant for a refreshed quote.');
  }

  return {
    ...estimate,
    lineItems: [...estimate.lineItems],
  };
}

/**
 * Step 073.2: Accepts and digitally signs an estimate without requiring login.
 */
export async function acceptAndSignEstimate(params: {
  readonly token: string;
  readonly signatureDataUrl: string;
  readonly clientIp?: string | undefined;
  readonly auditRepo?: AuditLogRepository | undefined;
}): Promise<TokenizedEstimate> {
  const { token, signatureDataUrl, clientIp = '127.0.0.1', auditRepo } = params;

  enforceTokenRateLimit(clientIp);

  if (!signatureDataUrl || signatureDataUrl.trim().length === 0) {
    throw new Error('Digital signature is required to accept this estimate.');
  }

  const estimate = estimateRegistry.get(token);
  if (!estimate) {
    throw new Error('Estimate not found: Invalid document token.');
  }

  if (estimate.status === 'accepted') {
    throw new Error('This estimate has already been digitally signed and accepted.');
  }

  if (estimate.status === 'declined') {
    throw new Error('This estimate has been declined.');
  }

  const acceptedAt = new Date().toISOString();
  estimate.status = 'accepted';
  estimate.acceptedAt = acceptedAt;
  estimate.signatureDataUrl = signatureDataUrl;
  estimate.signerIp = clientIp;

  estimateRegistry.set(token, estimate);

  logger.info('Tokenized estimate accepted and digitally signed by customer', {
    estimateId: estimate.id,
    estimateNumber: estimate.estimateNumber,
    totalUsd: estimate.totalAmountUsd,
    clientIp,
  });

  if (auditRepo) {
    await auditRepo.createLog({
      company_id: estimate.companyId,
      actor_id: '00000000-0000-7000-8000-000000000000',
      action: 'ESTIMATE_ACCEPTED',
      entity_type: 'estimate',
      entity_id: estimate.id,
      payload: {
        estimateNumber: estimate.estimateNumber,
        totalUsd: estimate.totalAmountUsd,
        acceptedAt,
        clientIp,
      },
    });
  }

  return {
    ...estimate,
    lineItems: [...estimate.lineItems],
  };
}
