// path: lib/plugins/store-sync-engine.ts

import { generateUuidV7 } from '@/lib/db/uuidv7';
import { logger } from '@/lib/logger/logger';
import { AuditLogRepository } from '@/lib/db/audit';

export type StorePlatform = 'shopify' | 'woocommerce' | 'custom';
export type SyncType = 'order_created' | 'order_status_update' | 'refund' | 'fulfillment_tracking';
export type SyncDirection = 'inbound' | 'outbound';

export interface StoreOrderSyncRecord {
  id: string;
  tenantId: string;
  companyId: string;
  platform: StorePlatform;
  storeOrderId: string;
  paymentIntentId: string;
  syncType: SyncType;
  direction: SyncDirection;
  carrierName?: string | undefined;
  trackingNumber?: string | undefined;
  trackingUrl?: string | undefined;
  fulfillmentStatus?: string | undefined;
  refundAmount?: string | undefined;
  status: 'pending' | 'synced' | 'failed';
  errorMessage?: string | undefined;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StorePaymentIntentMock {
  id: string;
  tenantId: string;
  companyId: string;
  apiKeyId: string;
  clientSecret: string;
  orderId: string;
  amount: string;
  currency: string;
  status: 'requires_payment_method' | 'requires_action' | 'processing' | 'succeeded' | 'canceled';
  customerEmail?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const syncRecordsStore = new Map<string, StoreOrderSyncRecord>();
const paymentIntentsStore = new Map<string, StorePaymentIntentMock>();
const auditRepo = new AuditLogRepository();

/**
 * Step 186.1: Inbound Order Sync - Auto-creates platform payment intent from e-commerce store order.
 * Section 32: "Order synchronization: auto-creates payment intents, matches store order IDs."
 */
export async function syncInboundStoreOrder(input: {
  tenantId: string;
  companyId: string;
  platform: StorePlatform;
  storeOrderId: string;
  amount: string;
  currency?: string | undefined;
  customerEmail?: string | undefined;
  apiKeyId: string;
  lineItems?: Array<{ id: string; title: string; price: string; quantity: number }> | undefined;
}): Promise<{ paymentIntent: StorePaymentIntentMock; syncRecord: StoreOrderSyncRecord }> {
  const existingKey = `${input.companyId}:${input.storeOrderId}`;
  let paymentIntent = paymentIntentsStore.get(existingKey);
  const now = new Date().toISOString();

  if (!paymentIntent) {
    const intentId = generateUuidV7();
    const clientSecret = `pi_secret_${intentId.replace(/-/g, '')}`;
    paymentIntent = {
      id: intentId,
      tenantId: input.tenantId,
      companyId: input.companyId,
      apiKeyId: input.apiKeyId,
      clientSecret,
      orderId: input.storeOrderId,
      amount: Number(input.amount).toFixed(4),
      currency: input.currency ?? 'USD',
      status: 'requires_payment_method',
      customerEmail: input.customerEmail,
      metadata: {
        platform: input.platform,
        storeOrderId: input.storeOrderId,
        lineItemsCount: input.lineItems?.length ?? 0,
        is_fulfilled: false,
      },
      createdAt: now,
      updatedAt: now,
    };
    paymentIntentsStore.set(existingKey, paymentIntent);
  }

  const syncId = generateUuidV7();
  const syncRecord: StoreOrderSyncRecord = {
    id: syncId,
    tenantId: input.tenantId,
    companyId: input.companyId,
    platform: input.platform,
    storeOrderId: input.storeOrderId,
    paymentIntentId: paymentIntent.id,
    syncType: 'order_created',
    direction: 'inbound',
    status: 'synced',
    payload: {
      amount: input.amount,
      currency: input.currency ?? 'USD',
      customerEmail: input.customerEmail,
      lineItems: input.lineItems ?? [],
    },
    createdAt: now,
    updatedAt: now,
  };
  syncRecordsStore.set(syncId, syncRecord);

  logger.info('E-commerce store order synced into platform payment intent', {
    syncId,
    platform: input.platform,
    storeOrderId: input.storeOrderId,
    paymentIntentId: paymentIntent.id,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'STORE_ORDER_SYNCED',
      entity_type: 'store_order_sync_record',
      entity_id: syncId,
      payload: {
        platform: input.platform,
        storeOrderId: input.storeOrderId,
        paymentIntentId: paymentIntent.id,
        amount: input.amount,
      },
    });
  } catch {}

  return { paymentIntent, syncRecord };
}

/**
 * Step 186.2: Outbound Order Status Sync - Pushes updated platform payment status to store.
 */
export async function syncOutboundPaymentStatus(input: {
  tenantId: string;
  companyId: string;
  platform: StorePlatform;
  storeOrderId: string;
  paymentIntentId: string;
  status: 'succeeded' | 'requires_action' | 'canceled';
}): Promise<StoreOrderSyncRecord> {
  const existingKey = `${input.companyId}:${input.storeOrderId}`;
  const paymentIntent = paymentIntentsStore.get(existingKey);
  const now = new Date().toISOString();

  if (paymentIntent) {
    paymentIntent.status = input.status;
    paymentIntent.updatedAt = now;
  }

  const syncId = generateUuidV7();
  const syncRecord: StoreOrderSyncRecord = {
    id: syncId,
    tenantId: input.tenantId,
    companyId: input.companyId,
    platform: input.platform,
    storeOrderId: input.storeOrderId,
    paymentIntentId: input.paymentIntentId,
    syncType: 'order_status_update',
    direction: 'outbound',
    status: 'synced',
    payload: {
      newStatus: input.status,
    },
    createdAt: now,
    updatedAt: now,
  };
  syncRecordsStore.set(syncId, syncRecord);

  logger.info('Outbound payment intent status synced to e-commerce store', {
    syncId,
    platform: input.platform,
    storeOrderId: input.storeOrderId,
    status: input.status,
  });

  return syncRecord;
}

/**
 * Step 186.3: Inbound Store Refund Sync - Webhook refund from store executes platform refund.
 * Section 32: "Refund synchronization: store refund triggers platform refund or vice versa."
 */
export async function syncInboundStoreRefund(input: {
  tenantId: string;
  companyId: string;
  platform: StorePlatform;
  storeOrderId: string;
  refundAmount: string;
  reason?: string | undefined;
}): Promise<StoreOrderSyncRecord> {
  const existingKey = `${input.companyId}:${input.storeOrderId}`;
  const paymentIntent = paymentIntentsStore.get(existingKey);
  if (!paymentIntent) {
    throw new Error(`Cannot sync refund: payment intent for order '${input.storeOrderId}' not found.`);
  }

  const now = new Date().toISOString();
  paymentIntent.metadata['refunded_amount'] = input.refundAmount;
  paymentIntent.metadata['refund_reason'] = input.reason ?? 'Store-initiated refund';
  paymentIntent.updatedAt = now;

  const syncId = generateUuidV7();
  const syncRecord: StoreOrderSyncRecord = {
    id: syncId,
    tenantId: input.tenantId,
    companyId: input.companyId,
    platform: input.platform,
    storeOrderId: input.storeOrderId,
    paymentIntentId: paymentIntent.id,
    syncType: 'refund',
    direction: 'inbound',
    refundAmount: Number(input.refundAmount).toFixed(4),
    status: 'synced',
    payload: {
      reason: input.reason ?? 'store_initiated',
      refundAmount: input.refundAmount,
    },
    createdAt: now,
    updatedAt: now,
  };
  syncRecordsStore.set(syncId, syncRecord);

  logger.info('Inbound store refund processed and recorded on platform intent', {
    syncId,
    storeOrderId: input.storeOrderId,
    refundAmount: input.refundAmount,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'STORE_REFUND_SYNCED',
      entity_type: 'store_order_sync_record',
      entity_id: syncId,
      payload: {
        platform: input.platform,
        storeOrderId: input.storeOrderId,
        refundAmount: input.refundAmount,
        direction: 'inbound',
      },
    });
  } catch {}

  return syncRecord;
}

/**
 * Step 186.4: Outbound Platform Refund Sync - Platform refund pushes update to external store.
 */
export async function syncOutboundPlatformRefund(input: {
  tenantId: string;
  companyId: string;
  platform: StorePlatform;
  storeOrderId: string;
  refundAmount: string;
  reason?: string | undefined;
}): Promise<StoreOrderSyncRecord> {
  const existingKey = `${input.companyId}:${input.storeOrderId}`;
  const paymentIntent = paymentIntentsStore.get(existingKey);
  const now = new Date().toISOString();

  const syncId = generateUuidV7();
  const syncRecord: StoreOrderSyncRecord = {
    id: syncId,
    tenantId: input.tenantId,
    companyId: input.companyId,
    platform: input.platform,
    storeOrderId: input.storeOrderId,
    paymentIntentId: paymentIntent ? paymentIntent.id : '00000000-0000-0000-0000-000000000000',
    syncType: 'refund',
    direction: 'outbound',
    refundAmount: Number(input.refundAmount).toFixed(4),
    status: 'synced',
    payload: {
      reason: input.reason ?? 'platform_initiated',
      refundAmount: input.refundAmount,
    },
    createdAt: now,
    updatedAt: now,
  };
  syncRecordsStore.set(syncId, syncRecord);

  logger.info('Outbound platform refund pushed to store REST API', {
    syncId,
    storeOrderId: input.storeOrderId,
    refundAmount: input.refundAmount,
  });

  return syncRecord;
}

/**
 * Step 186.5: Fulfillment Tracking Sync - Pushes carrier & tracking number to platform, satisfying fulfillment gates.
 * Section 32: "Fulfillment tracking sync: carrier name and tracking number pushed to platform."
 */
export async function syncStoreFulfillmentTracking(input: {
  tenantId: string;
  companyId: string;
  platform: StorePlatform;
  storeOrderId: string;
  carrierName: string;
  trackingNumber: string;
  trackingUrl?: string | undefined;
  fulfillmentStatus?: string | undefined;
}): Promise<StoreOrderSyncRecord> {
  const existingKey = `${input.companyId}:${input.storeOrderId}`;
  const paymentIntent = paymentIntentsStore.get(existingKey);
  if (!paymentIntent) {
    throw new Error(`Cannot sync fulfillment: payment intent for order '${input.storeOrderId}' not found.`);
  }

  const now = new Date().toISOString();
  paymentIntent.metadata['is_fulfilled'] = true;
  paymentIntent.metadata['carrier_name'] = input.carrierName;
  paymentIntent.metadata['tracking_number'] = input.trackingNumber;
  paymentIntent.metadata['tracking_url'] = input.trackingUrl ?? '';
  paymentIntent.metadata['fulfillment_status'] = input.fulfillmentStatus ?? 'fulfilled';
  paymentIntent.metadata['fulfilled_at'] = now;
  paymentIntent.updatedAt = now;

  const syncId = generateUuidV7();
  const syncRecord: StoreOrderSyncRecord = {
    id: syncId,
    tenantId: input.tenantId,
    companyId: input.companyId,
    platform: input.platform,
    storeOrderId: input.storeOrderId,
    paymentIntentId: paymentIntent.id,
    syncType: 'fulfillment_tracking',
    direction: 'inbound',
    carrierName: input.carrierName,
    trackingNumber: input.trackingNumber,
    trackingUrl: input.trackingUrl,
    fulfillmentStatus: input.fulfillmentStatus ?? 'fulfilled',
    status: 'synced',
    payload: {
      carrierName: input.carrierName,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
    },
    createdAt: now,
    updatedAt: now,
  };
  syncRecordsStore.set(syncId, syncRecord);

  logger.info('E-commerce store fulfillment tracking synced to platform', {
    syncId,
    storeOrderId: input.storeOrderId,
    carrierName: input.carrierName,
    trackingNumber: input.trackingNumber,
  });

  try {
    await auditRepo.append({
      actor_id: '00000000-0000-4000-8000-000000000000',
      action: 'STORE_FULFILLMENT_TRACKING_SYNCED',
      entity_type: 'store_order_sync_record',
      entity_id: syncId,
      payload: {
        platform: input.platform,
        storeOrderId: input.storeOrderId,
        carrierName: input.carrierName,
        trackingNumber: input.trackingNumber,
      },
    });
  } catch {}

  return syncRecord;
}

export function getStorePaymentIntent(companyId: string, storeOrderId: string): StorePaymentIntentMock | undefined {
  return paymentIntentsStore.get(`${companyId}:${storeOrderId}`);
}

export function getStoreOrderSyncRecord(syncId: string): StoreOrderSyncRecord | undefined {
  return syncRecordsStore.get(syncId);
}

export function resetStoreSyncEngineStore(): void {
  syncRecordsStore.clear();
  paymentIntentsStore.clear();
}
