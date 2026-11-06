// path: lib/payment/stripe-client.ts

import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { logger } from '@/lib/logger/logger';

let stripePromiseCache: Promise<Stripe | null> | null = null;
let cachedKey: string | null = null;

/**
 * Initializes and caches the browser Stripe.js instance for client-side Elements (Step 133.1).
 * Uses publishable API key (pk_test_* or pk_live_*).
 */
export function getStripeClient(publishableKey?: string): Promise<Stripe | null> {
  const key =
    publishableKey ??
    process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ??
    process.env['STRIPE_PUBLISHABLE_KEY'] ??
    'pk_test_mock_stripe_publishable_key_001';

  if (!key || !key.trim()) {
    logger.warn('Stripe publishable key is missing; cannot initialize Stripe Elements.');
    return Promise.resolve(null);
  }

  if (stripePromiseCache && cachedKey === key) {
    return stripePromiseCache;
  }

  cachedKey = key;
  stripePromiseCache = loadStripe(key);

  return stripePromiseCache;
}

/**
 * Resets Stripe client promise cache (for test isolation).
 */
export function resetStripeClientCache(): void {
  stripePromiseCache = null;
  cachedKey = null;
}
