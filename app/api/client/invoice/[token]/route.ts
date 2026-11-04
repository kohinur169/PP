// path: app/api/client/invoice/[token]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyInvoiceToken, payTokenizedInvoice } from '@/lib/client-portal/tokens';

const payInvoiceSchema = z.object({
  paymentMethod: z.object({
    type: z.string().default('card'),
    last4: z.string().length(4).default('4242'),
  }),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const clientIp = getClientIp(req);
  try {
    const { token } = await params;
    const invoice = await verifyInvoiceToken(token, clientIp);

    return NextResponse.json({
      invoice,
    });
  } catch (error: any) {
    const isRateLimit = error.message?.includes('Too Many Requests');
    const isNotFound = error.message?.includes('not found') || error.message?.includes('expired');
    const status = isRateLimit ? 429 : isNotFound ? 404 : 400;

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/client-invoice',
        title: isRateLimit ? 'Too Many Requests' : 'Invoice Access Error',
        status,
        detail: error.message || 'Failed to retrieve invoice',
      },
      { status }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const clientIp = getClientIp(req);
  try {
    const { token } = await params;
    const body = await req.json();
    const parsed = payInvoiceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://kdsolution.it/errors/validation',
          title: 'Invalid Payment Data',
          status: 400,
          detail: parsed.error.issues[0]?.message || 'Validation failed',
        },
        { status: 400 }
      );
    }

    const paidInvoice = await payTokenizedInvoice({
      token,
      paymentMethod: parsed.data.paymentMethod,
      clientIp,
    });

    return NextResponse.json({
      success: true,
      invoice: paidInvoice,
      receipt: paidInvoice.paymentReceipt,
    });
  } catch (error: any) {
    const isRateLimit = error.message?.includes('Too Many Requests');
    const status = isRateLimit ? 429 : 400;

    return NextResponse.json(
      {
        type: 'https://kdsolution.it/errors/client-invoice-payment',
        title: isRateLimit ? 'Too Many Requests' : 'Payment Failed',
        status,
        detail: error.message || 'Failed to process invoice payment',
      },
      { status }
    );
  }
}
