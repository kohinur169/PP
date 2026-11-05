// path: app/api/webhooks/payment/airwallex/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { AirwallexAdapter } from '@/lib/processors/airwallex';
import { getSupabaseClient } from '@/lib/database/client';
import { logger } from '@/lib/logger/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-signature') ?? req.headers.get('airwallex-signature') ?? '';
  const webhookSecret = process.env['AIRWALLEX_WEBHOOK_SECRET'] ?? 'mock_awx_whsec_secret';

  const rawBody = await req.text();

  const adapter = new AirwallexAdapter({
    clientId: process.env['AIRWALLEX_CLIENT_ID'] ?? 'mock_awx_client_id',
    apiKey: process.env['AIRWALLEX_API_KEY'] ?? 'mock_awx_api_key',
    baseUrl: 'mock://api.airwallex.com',
    webhookSecret,
  });

  const verification = await adapter.verifyWebhook(rawBody, signature, webhookSecret);
  if (!verification.isValid) {
    logger.warn('Airwallex webhook rejected', {
      reason: verification.failureReason,
    });
    return NextResponse.json({ error: 'Invalid Airwallex webhook signature' }, { status: 401 });
  }

  const eventType = verification.eventType ?? 'unknown';
  const payload = verification.parsedPayload ?? {};
  const dataObject = (payload['data'] as Record<string, unknown> | undefined) ?? payload;

  logger.info('Received verified Airwallex webhook event', {
    eventType,
    eventId: verification.providerEventId,
  });

  try {
    const supabase = getSupabaseClient({ useServiceRole: true });

    if (eventType.includes('account.') && dataObject) {
      const accountId = (dataObject['account_id'] as string) ?? (dataObject['id'] as string);
      if (accountId) {
        await supabase
          .from('submerchant_accounts')
          .update({
            last_synced_at: new Date().toISOString(),
            metadata: {
              last_event_type: eventType,
              payload: dataObject,
            },
          })
          .eq('provider_name', 'airwallex')
          .eq('provider_submerchant_id', accountId);
      }
    }
  } catch (err: unknown) {
    logger.warn('Failed to persist Airwallex webhook update', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true, eventType }, { status: 200 });
}
