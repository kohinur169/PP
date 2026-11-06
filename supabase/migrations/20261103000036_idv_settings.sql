-- path: supabase/migrations/20261103000036_idv_settings.sql

CREATE TABLE IF NOT EXISTS public.idv_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  active_vendor VARCHAR(32) NOT NULL DEFAULT 'none',
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  fail_closed_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_idv_active_vendor CHECK (active_vendor IN ('none', 'jumio', 'didit', 'sumsub'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_idv_settings_tenant ON public.idv_settings (tenant_id);

ALTER TABLE public.idv_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idv_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY idv_settings_tenant_isolation ON public.idv_settings
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
