-- path: supabase/migrations/20261103000082_payout_clearing_files.sql

-- Table for generated NACHA and ISO 20022 clearing files
CREATE TABLE IF NOT EXISTS public.payout_clearing_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.mass_payout_batches(id) ON DELETE CASCADE,
  file_format VARCHAR(16) NOT NULL
    CHECK (file_format IN ('nacha', 'iso20022')),
  file_reference VARCHAR(64) NOT NULL UNIQUE,
  file_content TEXT NOT NULL,
  total_credit_amount NUMERIC(18, 4) NOT NULL,
  entry_count INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated', 'transmitted', 'acknowledged', 'rejected')),
  generated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_files_tenant ON public.payout_clearing_files (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payout_files_batch ON public.payout_clearing_files (batch_id);
CREATE INDEX IF NOT EXISTS idx_payout_files_format ON public.payout_clearing_files (file_format);

ALTER TABLE public.payout_clearing_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_clearing_files FORCE ROW LEVEL SECURITY;

CREATE POLICY payout_clearing_files_tenant_isolation ON public.payout_clearing_files
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
