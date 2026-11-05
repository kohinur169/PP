-- path: db/migrations/086_store_order_sync_records.sql

-- Table for tracking bi-directional e-commerce store synchronization: orders, refunds, and fulfillment tracking
CREATE TABLE IF NOT EXISTS public.store_order_sync_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  platform VARCHAR(32) NOT NULL
    CHECK (platform IN ('shopify', 'woocommerce', 'custom')),
  store_order_id VARCHAR(128) NOT NULL,
  payment_intent_id UUID REFERENCES public.store_payment_intents(id) ON DELETE SET NULL,
  sync_type VARCHAR(32) NOT NULL
    CHECK (sync_type IN ('order_created', 'order_status_update', 'refund', 'fulfillment_tracking')),
  direction VARCHAR(16) NOT NULL
    CHECK (direction IN ('inbound', 'outbound')),
  carrier_name VARCHAR(128),
  tracking_number VARCHAR(128),
  tracking_url VARCHAR(512),
  fulfillment_status VARCHAR(32),
  refund_amount NUMERIC(18,4),
  status VARCHAR(32) NOT NULL DEFAULT 'synced'
    CHECK (status IN ('pending', 'synced', 'failed')),
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_sync_tenant ON public.store_order_sync_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_store_sync_company ON public.store_order_sync_records (company_id);
CREATE INDEX IF NOT EXISTS idx_store_sync_order ON public.store_order_sync_records (store_order_id);
CREATE INDEX IF NOT EXISTS idx_store_sync_platform ON public.store_order_sync_records (platform);
CREATE INDEX IF NOT EXISTS idx_store_sync_intent ON public.store_order_sync_records (payment_intent_id);

ALTER TABLE public.store_order_sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_sync_records FORCE ROW LEVEL SECURITY;

CREATE POLICY store_order_sync_records_tenant_isolation ON public.store_order_sync_records
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
