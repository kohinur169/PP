-- path: db/migrations/054_email_provider_configs.sql

CREATE TABLE IF NOT EXISTS public.email_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_type VARCHAR(32) NOT NULL
    CHECK (provider_type IN ('smtp', 'resend', 'sendgrid', 'postmark', 'ses')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  from_name VARCHAR(100) NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  reply_to VARCHAR(255),
  smtp_host VARCHAR(255),
  smtp_port INT,
  smtp_secure BOOLEAN DEFAULT true,
  smtp_username VARCHAR(255),
  encrypted_secret TEXT NOT NULL,
  masked_secret VARCHAR(64) NOT NULL,
  last_test_sent_at TIMESTAMPTZ,
  last_test_status VARCHAR(32)
    CHECK (last_test_status IN ('pending', 'success', 'failed')),
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_configs_tenant ON public.email_provider_configs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_configs_active ON public.email_provider_configs (tenant_id, is_active);

ALTER TABLE public.email_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_provider_configs FORCE ROW LEVEL SECURITY;

CREATE POLICY email_provider_configs_tenant_isolation ON public.email_provider_configs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
