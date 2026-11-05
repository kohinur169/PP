-- path: supabase/migrations/20261103000095_create_invoice_items.sql

-- Table for invoice line items with multi-tier discounts and tax calculations
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1.0000,
  unit_price NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  discount NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  tax_amount NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant ON public.invoice_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items (invoice_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items FORCE ROW LEVEL SECURITY;

CREATE POLICY invoice_items_tenant_isolation ON public.invoice_items
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
