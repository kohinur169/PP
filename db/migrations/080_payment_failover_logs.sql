-- path: db/migrations/080_payment_failover_logs.sql

-- Table for tracking soft decline automatic failovers and terminal hard declines
CREATE TABLE IF NOT EXISTS public.payment_failover_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_intent_id UUID NOT NULL REFERENCES public.store_payment_intents(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  primary_processor VARCHAR(32) NOT NULL,
  decline_code VARCHAR(16) NOT NULL,
  decline_category VARCHAR(16) NOT NULL
    CHECK (decline_category IN ('soft', 'hard')),
  failover_processor VARCHAR(32),
  failover_status VARCHAR(32) NOT NULL
    CHECK (failover_status IN ('succeeded', 'failed', 'terminal_hard_decline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failover_logs_tenant ON public.payment_failover_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_failover_logs_intent ON public.payment_failover_logs (payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_failover_logs_category ON public.payment_failover_logs (decline_category);

ALTER TABLE public.payment_failover_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_failover_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_failover_logs_tenant_isolation ON public.payment_failover_logs
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
