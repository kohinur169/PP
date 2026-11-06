-- path: supabase/migrations/20261103000094_create_invoices.sql

-- Table for professional invoices with sequential numbering and physical locking
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID,
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  invoice_number VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void')),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  discount_total NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  tax_total NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  total NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  amount_paid NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  remaining_balance NUMERIC(18,4) NOT NULL DEFAULT 0.0000,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  notes TEXT,
  terms TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT uq_invoices_tenant_company_number UNIQUE (tenant_id, company_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.invoices (company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices (due_date);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY invoices_tenant_isolation ON public.invoices
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
