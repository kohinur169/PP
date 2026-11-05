// path: lib/validation/checkout-session.ts

import { z } from 'zod';

export const checkoutSessionLineItemSchema = z.object({
  name: z.string().min(1, 'Line item name is required'),
  quantity: z.number().int().positive('Quantity must be greater than 0'),
  unitPriceUsd: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Invalid unit price format (numeric(18,4))'),
});

export const createCheckoutSessionSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  amountUsd: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Invalid total amount format (numeric(18,4))'),
  currency: z.literal('USD').default('USD'),
  customerEmail: z.string().email().optional(),
  returnUrl: z.string().url('returnUrl must be a valid URL'),
  cancelUrl: z.string().url('cancelUrl must be a valid URL'),
  lineItems: z.array(checkoutSessionLineItemSchema).optional().default([]),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;

export interface CheckoutSessionRecord {
  id: string;
  sessionId: string;
  tenantId: string;
  companyId: string;
  orderId: string;
  amountUsd: string;
  currency: string;
  customerEmail?: string | undefined;
  returnUrl: string;
  cancelUrl: string;
  checkoutUrl: string;
  status: 'open' | 'completed' | 'expired';
  isTest: boolean;
  createdAt: string;
  expiresAt: string;
}
