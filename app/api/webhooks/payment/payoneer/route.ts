// path: app/api/webhooks/payment/payoneer/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { PayoneerAdapter } from '@/lib/processors/payoneer';
import { getSupabaseClient } from '@/lib/database/client';
import { logger } from '@/lib/logger/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-payoneer-signature') ?? req.headers.get('x-signature') ?? '';
  const webhookSecret = process.env['PAYONEER_WEBHOOK_SECRET'] ?? 'mock_payoneer_webhook_secret';

  const rawBody = await req.text();

  const adapter = new PayoneerAdapter({
    programId: process.env['PAYONEER_PROGRAM_ID'] ?? 'mock_prog_01',
    clientId: process.env['PAYONEER_CLIENT_ID'] ?? 'mock_client_id',
    clientSecret: process.env['PAYONEER_CLIENT_SECRET'] ?? 'mock_secret',
    baseUrl: 'mock://api.payoneer.com',
  });

  const verification = await adapter.verifyWebhook(rawBody, signature, webhookSecret);
  if (!verification.isValid) {
    logger.warn('Payoneer webhook verification rejected', {
      reason: verification.failureReason,
    });
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const payload = verification.parsedPayload ?? {};
  const status = (payload['status'] as string) ?? '';
  const payoutId = (payload['payout_id'] as string) ?? '';
  const clientRefId = (payload['client_reference_id'] as string) ?? '';

  logger.info('Received verified Payoneer webhook', {
    eventType: verification.eventType,
    payoutId,
    status,
    clientRefId,
  });

  try {
    const supabase = getSupabaseClient({ useServiceRole: true });
    // Update submerchant or payout status records if present
    await supabase.from('submerchant_accounts').update({
      last_synced_at: new Date().toISOString(),
      metadata: {
        last_payout_id: payoutId,
        last_payout_status: status,
      },
    }).eq('provider_name', 'payoneer');
  } catch (err: unknown) {
    logger.warn('Could not update database from Payoneer webhook', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true, payoutId, status }, { status: 200 });
}
