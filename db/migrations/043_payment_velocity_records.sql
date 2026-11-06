-- path: db/migrations/043_payment_velocity_records.sql

CREATE TABLE IF NOT EXISTS public.payment_velocity_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  card_fingerprint VARCHAR(128),
  ip_address VARCHAR(45) NOT NULL,
  window_type VARCHAR(32) NOT NULL DEFAULT 'hourly'
    CHECK (window_type IN ('hourly', 'daily')),
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_velocity_tenant ON public.payment_velocity_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_velocity_fingerprint ON public.payment_velocity_records (card_fingerprint);
CREATE INDEX IF NOT EXISTS idx_velocity_ip ON public.payment_velocity_records (ip_address);
CREATE INDEX IF NOT EXISTS idx_velocity_window_start ON public.payment_velocity_records (window_start);

ALTER TABLE public.payment_velocity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_velocity_records FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_velocity_records_tenant_isolation ON public.payment_velocity_records
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
