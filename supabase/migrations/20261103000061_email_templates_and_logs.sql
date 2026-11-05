-- path: supabase/migrations/20261103000061_email_templates_and_logs.sql

-- 1. Table for email templates editable by super_admin
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_key VARCHAR(64) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_email_templates_tenant_key UNIQUE (tenant_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON public.email_templates (tenant_id);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY email_templates_tenant_isolation ON public.email_templates
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Table for audit logging every email send and background retry queue
CREATE TABLE IF NOT EXISTS public.email_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_key VARCHAR(64) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('queued', 'sent', 'failed', 'retrying')),
  provider_message_id VARCHAR(128),
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_send_logs_tenant ON public.email_send_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_send_logs_status ON public.email_send_logs (status);

ALTER TABLE public.email_send_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY email_send_logs_tenant_isolation ON public.email_send_logs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
