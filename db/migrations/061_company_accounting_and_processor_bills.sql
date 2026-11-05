-- path: db/migrations/061_company_accounting_and_processor_bills.sql

-- 1. Table for platform company internal accounting (income, expenses, tax provisions)
CREATE TABLE IF NOT EXISTS public.company_accounting_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_type VARCHAR(32) NOT NULL
    CHECK (entry_type IN ('income', 'expense', 'tax_provision')),
  category VARCHAR(64) NOT NULL,
  amount_usd NUMERIC(18,4) NOT NULL,
  reference_id VARCHAR(128),
  entry_date DATE NOT NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_tenant ON public.company_accounting_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_accounting_date ON public.company_accounting_entries (entry_date);

ALTER TABLE public.company_accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_accounting_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY company_accounting_entries_tenant_isolation ON public.company_accounting_entries
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for processor bill matching and fee reconciliation records
CREATE TABLE IF NOT EXISTS public.processor_bill_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  processor VARCHAR(32) NOT NULL,
  billing_period VARCHAR(16) NOT NULL,
  billed_amount_usd NUMERIC(18,4) NOT NULL,
  matched_ledger_amount_usd NUMERIC(18,4) NOT NULL,
  discrepancy_usd NUMERIC(18,4) NOT NULL,
  is_matched BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processor_bills_tenant ON public.processor_bill_records (tenant_id);

ALTER TABLE public.processor_bill_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processor_bill_records FORCE ROW LEVEL SECURITY;

CREATE POLICY processor_bill_records_tenant_isolation ON public.processor_bill_records
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
