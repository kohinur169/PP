// path: app/api/v1/checkout/sessions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/api/auth';
import {
  createCheckoutSessionSchema,
  CheckoutSessionRecord,
} from '@/lib/validation/checkout-session';
import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

const checkoutSessionsStore = new Map<string, CheckoutSessionRecord>();
const auditRepo = new AuditLogRepository();

export async function POST(req: NextRequest) {
  let context;
  try {
    context = await authenticateApiRequest(req);
  } catch (authError: any) {
    return NextResponse.json(
      {
        error: {
          code: authError.code ?? 'UNAUTHORIZED',
          message: authError.message ?? 'Authentication failed',
        },
      },
      { status: authError.statusCode ?? 401 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
      { status: 400 }
    );
  }

  const parseResult = createCheckoutSessionSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid request payload',
          details: parseResult.error.flatten(),
        },
      },
      { status: 422 }
    );
  }

  const data = parseResult.data;
  const id = generateUuidV7();
  const sessionId = `cs_${context.environment === 'test' ? 'test_' : ''}${generateUuidV7().replace(/-/g, '').slice(0, 24)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Production checkout URL matching KD Pay hosted checkout domain
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://checkout.kdsolution.it';
  const checkoutUrl = `${baseUrl}/pay/${sessionId}`;

  const sessionRecord: CheckoutSessionRecord = {
    id,
    sessionId,
    tenantId: context.tenantId,
    companyId: context.companyId,
    orderId: data.orderId,
    amountUsd: Number(data.amountUsd).toFixed(4),
    currency: 'USD',
    customerEmail: data.customerEmail,
    returnUrl: data.returnUrl,
    cancelUrl: data.cancelUrl,
    checkoutUrl,
    status: 'open',
    isTest: context.environment === 'test',
    createdAt: now.toISOString(),
    expiresAt,
  };

  checkoutSessionsStore.set(sessionId, sessionRecord);

  logger.info('Checkout session created via Public API', {
    sessionId,
    companyId: context.companyId,
    orderId: data.orderId,
    amount: sessionRecord.amountUsd,
    environment: context.environment,
  });

  try {
    await auditRepo.append({
      actor_id: context.keyRecord.createdBy,
      action: 'CHECKOUT_SESSION_CREATED',
      entity_type: 'checkout_session',
      entity_id: id,
      payload: {
        sessionId,
        orderId: data.orderId,
        amountUsd: sessionRecord.amountUsd,
        environment: context.environment,
      },
    });
  } catch {}

  return NextResponse.json(
    {
      session_id: sessionId,
      checkout_url: checkoutUrl,
      amount: sessionRecord.amountUsd,
      currency: 'USD',
      status: 'open',
      expires_at: expiresAt,
    },
    { status: 201 }
  );
}

export function getCheckoutSession(sessionId: string): CheckoutSessionRecord | null {
  return checkoutSessionsStore.get(sessionId) ?? null;
}

export function resetCheckoutSessionsStore(): void {
  checkoutSessionsStore.clear();
}
