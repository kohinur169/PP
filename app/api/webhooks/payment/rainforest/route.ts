// path: app/api/webhooks/payment/rainforest/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { RainforestAdapter } from '@/lib/processors/rainforest';
import { getSupabaseClient } from '@/lib/database/client';
import { logger } from '@/lib/logger/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature =
    req.headers.get('rainforest-signature') ?? req.headers.get('x-rainforest-signature') ?? '';
  const webhookSecret =
    process.env['RAINFOREST_WEBHOOK_SECRET'] ?? 'mock_rf_webhook_secret_key';

  const rawBody = await req.text();

  const adapter = new RainforestAdapter({
    apiKey: process.env['RAINFOREST_API_KEY'] ?? 'mock_rf_api_key',
    baseUrl: 'mock://api.rainforestpay.com',
  });

  const verification = await adapter.verifyWebhook(rawBody, signature, webhookSecret);
  if (!verification.isValid) {
    logger.warn('Rainforest webhook signature rejected', {
      reason: verification.failureReason,
    });
    return NextResponse.json({ error: 'Invalid Rainforest webhook signature' }, { status: 401 });
  }

  const payload = verification.parsedPayload ?? {};
  const eventType = verification.eventType ?? 'unknown';
  const merchantId = (payload['merchant_id'] as string) ?? '';

  logger.info('Received valid Rainforest webhook event', {
    eventType,
    merchantId,
  });

  try {
    const supabase = getSupabaseClient({ useServiceRole: true });
    // Update submerchant account capability status if merchant event
    if (eventType.startsWith('merchant.')) {
      await supabase.from('submerchant_accounts').update({
        last_synced_at: new Date().toISOString(),
        metadata: {
          last_event_type: eventType,
          event_payload: payload,
        },
      }).eq('provider_name', 'rainforest').eq('provider_submerchant_id', merchantId);
    }
  } catch (err: unknown) {
    logger.warn('Failed to update database for Rainforest webhook', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true, eventType }, { status: 200 });
}
