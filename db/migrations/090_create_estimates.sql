-- path: db/migrations/090_create_estimates.sql

-- Tables for estimates/quotes and estimate line items with automated expiration
CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID,
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  estimate_number VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted', 'void')),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  discount_total NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  tax_total NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  terms TEXT,
  converted_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT uq_estimates_tenant_company_number UNIQUE (tenant_id, company_id, estimate_number)
);

CREATE INDEX IF NOT EXISTS idx_estimates_tenant ON public.estimates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_estimates_company ON public.estimates (company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON public.estimates (status);
CREATE INDEX IF NOT EXISTS idx_estimates_expires ON public.estimates (expires_at);

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimates FORCE ROW LEVEL SECURITY;

CREATE POLICY estimates_tenant_isolation ON public.estimates
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS public.estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_estimate_items_tenant ON public.estimate_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate ON public.estimate_items (estimate_id);

ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_items_tenant_isolation ON public.estimate_items
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
