// path: tests/plugins/store-sync-engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import {
  syncInboundStoreOrder,
  syncOutboundPaymentStatus,
  syncInboundStoreRefund,
  syncOutboundPlatformRefund,
  syncStoreFulfillmentTracking,
  getStorePaymentIntent,
  resetStoreSyncEngineStore,
} from '@/lib/plugins/store-sync-engine';

describe('Store Bi-Directional Order, Refund & Fulfillment Sync Engine (Section 32 - Step 186)', () => {
  const tenantId = '11111111-2222-4333-8444-555555555555';
  const companyId = '22222222-3333-4444-8555-666666666666';
  const apiKeyId = '33333333-4444-5555-8666-777777777777';
  const storeOrderId = 'SP-89012';

  beforeEach(() => {
    resetStoreSyncEngineStore();
  });

  it('auto-creates platform payment intent from inbound e-commerce store order', async () => {
    const { paymentIntent, syncRecord } = await syncInboundStoreOrder({
      tenantId,
      companyId,
      platform: 'shopify',
      storeOrderId,
      amount: '249.50',
      currency: 'USD',
      customerEmail: 'buyer@example.com',
      apiKeyId,
      lineItems: [
        { id: 'item_1', title: 'Ergonomic Desk Chair', price: '249.50', quantity: 1 },
      ],
    });

    expect(paymentIntent.id).toBeDefined();
    expect(paymentIntent.amount).toBe('249.5000');
    expect(paymentIntent.clientSecret).toMatch(/^pi_secret_/);
    expect(paymentIntent.customerEmail).toBe('buyer@example.com');
    expect(paymentIntent.metadata['is_fulfilled']).toBe(false);

    expect(syncRecord.syncType).toBe('order_created');
    expect(syncRecord.direction).toBe('inbound');
    expect(syncRecord.status).toBe('synced');
  });

  it('updates payment intent status and logs outbound status sync record', async () => {
    const { paymentIntent } = await syncInboundStoreOrder({
      tenantId,
      companyId,
      platform: 'shopify',
      storeOrderId,
      amount: '120.00',
      apiKeyId,
    });

    const syncRecord = await syncOutboundPaymentStatus({
      tenantId,
      companyId,
      platform: 'shopify',
      storeOrderId,
      paymentIntentId: paymentIntent.id,
      status: 'succeeded',
    });

    expect(syncRecord.syncType).toBe('order_status_update');
    expect(syncRecord.direction).toBe('outbound');

    const intent = getStorePaymentIntent(companyId, storeOrderId);
    expect(intent?.status).toBe('succeeded');
  });

  it('synchronizes inbound store-initiated refund onto platform payment intent', async () => {
    await syncInboundStoreOrder({
      tenantId,
      companyId,
      platform: 'woocommerce',
      storeOrderId: 'WC-4567',
      amount: '99.00',
      apiKeyId,
    });

    const refundSync = await syncInboundStoreRefund({
      tenantId,
      companyId,
      platform: 'woocommerce',
      storeOrderId: 'WC-4567',
      refundAmount: '49.50',
      reason: 'Partial customer return',
    });

    expect(refundSync.syncType).toBe('refund');
    expect(refundSync.direction).toBe('inbound');
    expect(refundSync.refundAmount).toBe('49.5000');

    const intent = getStorePaymentIntent(companyId, 'WC-4567');
    expect(intent?.metadata['refunded_amount']).toBe('49.50');
    expect(intent?.metadata['refund_reason']).toBe('Partial customer return');
  });

  it('records outbound platform-initiated refund push to store REST API', async () => {
    const refundSync = await syncOutboundPlatformRefund({
      tenantId,
      companyId,
      platform: 'shopify',
      storeOrderId: 'SP-101',
      refundAmount: '120.00',
      reason: 'Chargeback prevention refund',
    });

    expect(refundSync.syncType).toBe('refund');
    expect(refundSync.direction).toBe('outbound');
    expect(refundSync.refundAmount).toBe('120.0000');
    expect(refundSync.status).toBe('synced');
  });

  it('synchronizes carrier & tracking number to platform, satisfying fulfillment gates', async () => {
    await syncInboundStoreOrder({
      tenantId,
      companyId,
      platform: 'shopify',
      storeOrderId,
      amount: '350.00',
      apiKeyId,
    });

    const trackingSync = await syncStoreFulfillmentTracking({
      tenantId,
      companyId,
      platform: 'shopify',
      storeOrderId,
      carrierName: 'FedEx Express',
      trackingNumber: '794812345678',
      trackingUrl: 'https://fedex.com/track?id=794812345678',
      fulfillmentStatus: 'fulfilled',
    });

    expect(trackingSync.syncType).toBe('fulfillment_tracking');
    expect(trackingSync.carrierName).toBe('FedEx Express');
    expect(trackingSync.trackingNumber).toBe('794812345678');

    const intent = getStorePaymentIntent(companyId, storeOrderId);
    expect(intent?.metadata['is_fulfilled']).toBe(true);
    expect(intent?.metadata['carrier_name']).toBe('FedEx Express');
    expect(intent?.metadata['tracking_number']).toBe('794812345678');
    expect(intent?.metadata['fulfilled_at']).toBeDefined();
  });
});
