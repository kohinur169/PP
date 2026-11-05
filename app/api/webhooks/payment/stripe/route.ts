// path: app/api/webhooks/payment/stripe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { StripeAdapter } from '@/lib/processors/stripe';
import { getSupabaseClient } from '@/lib/database/client';
import { logger } from '@/lib/logger/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('stripe-signature') ?? '';
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? 'whsec_test_mock_secret_key';

  const rawBody = await req.text();

  const adapter = new StripeAdapter({
    apiKey: process.env['STRIPE_SECRET_KEY'] ?? 'sk_test_mock_key_001',
    webhookSecret,
  });

  const verification = await adapter.verifyWebhook(rawBody, signature, webhookSecret);
  if (!verification.isValid) {
    logger.warn('Stripe webhook signature rejected', {
      reason: verification.failureReason,
    });
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 401 });
  }

  const eventType = verification.eventType ?? 'unknown';
  const payload = verification.parsedPayload ?? {};
  const dataObject = (payload['data'] as Record<string, unknown> | undefined)?.['object'] as
    | Record<string, unknown>
    | undefined;

  logger.info('Received verified Stripe webhook event', {
    eventType,
    eventId: verification.providerEventId,
  });

  try {
    const supabase = getSupabaseClient({ useServiceRole: true });

    // Handle account capability updates
    if (eventType === 'account.updated' && dataObject) {
      const accountId = dataObject['id'] as string;
      const chargesEnabled = Boolean(dataObject['charges_enabled']);
      const payoutsEnabled = Boolean(dataObject['payouts_enabled']);
      const capabilities = (dataObject['capabilities'] as Record<string, string> | undefined) ?? {};

      await supabase
        .from('submerchant_accounts')
        .update({
          status: chargesEnabled ? 'active' : 'restricted',
          capabilities: {
            card_payments: capabilities['card_payments'] === 'active',
            transfers: capabilities['transfers'] === 'active',
            payouts: payoutsEnabled,
          },
          last_synced_at: new Date().toISOString(),
          metadata: {
            last_event_type: eventType,
          },
        })
        .eq('provider_name', 'stripe_connect')
        .eq('provider_submerchant_id', accountId);
    }
  } catch (err: unknown) {
    logger.warn('Failed to update database for Stripe webhook', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true, eventType }, { status: 200 });
}
