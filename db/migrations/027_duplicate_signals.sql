-- path: db/migrations/027_duplicate_signals.sql

CREATE TABLE IF NOT EXISTS public.duplicate_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  signal_type VARCHAR(64) NOT NULL,
  signal_value_hash VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  matched_signal_id UUID REFERENCES public.duplicate_signals(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duplicate_signals_type_hash ON public.duplicate_signals (signal_type, signal_value_hash);
CREATE INDEX IF NOT EXISTS idx_duplicate_signals_tenant ON public.duplicate_signals (tenant_id);

ALTER TABLE public.duplicate_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_signals FORCE ROW LEVEL SECURITY;

CREATE POLICY duplicate_signals_tenant_isolation ON public.duplicate_signals
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
