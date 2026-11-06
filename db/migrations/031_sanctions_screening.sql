-- path: db/migrations/031_sanctions_screening.sql

CREATE TABLE IF NOT EXISTS public.sanctions_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_source VARCHAR(32) NOT NULL,
  entity_type VARCHAR(32) NOT NULL DEFAULT 'individual',
  primary_name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  sanction_program VARCHAR(128),
  country_code VARCHAR(2),
  publication_date DATE NOT NULL DEFAULT CURRENT_DATE,
  record_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sanctions_lists_name ON public.sanctions_lists (primary_name);
CREATE INDEX IF NOT EXISTS idx_sanctions_lists_source ON public.sanctions_lists (list_source);

ALTER TABLE public.sanctions_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctions_lists FORCE ROW LEVEL SECURITY;

CREATE POLICY sanctions_lists_read_all ON public.sanctions_lists
  FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.sanctions_screening_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'merchant',
  match_found BOOLEAN NOT NULL DEFAULT false,
  highest_similarity NUMERIC(5, 4) NOT NULL DEFAULT 0,
  matched_entity_id UUID REFERENCES public.sanctions_lists(id) ON DELETE SET NULL,
  matched_name TEXT,
  matched_list_source VARCHAR(32),
  case_status VARCHAR(32) NOT NULL DEFAULT 'cleared',
  investigation_case_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sanctions_logs_tenant ON public.sanctions_screening_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_logs_company ON public.sanctions_screening_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_logs_status ON public.sanctions_screening_logs (case_status);

ALTER TABLE public.sanctions_screening_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctions_screening_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY sanctions_screening_logs_tenant_isolation ON public.sanctions_screening_logs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
