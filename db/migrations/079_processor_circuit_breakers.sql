-- path: db/migrations/079_processor_circuit_breakers.sql

-- Table for tracking real-time processor health, circuit breaker state, and performance metrics
CREATE TABLE IF NOT EXISTS public.processor_circuit_breaker_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  processor_id VARCHAR(32) NOT NULL
    CHECK (processor_id IN ('nmi', 'stripe_connect', 'rainforest', 'airwallex', 'payoneer')),
  state VARCHAR(16) NOT NULL DEFAULT 'closed'
    CHECK (state IN ('closed', 'open', 'half_open')),
  consecutive_failures INT NOT NULL DEFAULT 0,
  failure_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  last_failure_at TIMESTAMPTZ,
  tripped_at TIMESTAMPTZ,
  cooldown_seconds INT NOT NULL DEFAULT 60,
  total_requests INT NOT NULL DEFAULT 0,
  successful_requests INT NOT NULL DEFAULT 0,
  failed_requests INT NOT NULL DEFAULT 0,
  average_latency_ms NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_volume_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_proc_breaker_tenant_proc UNIQUE (tenant_id, processor_id)
);

CREATE INDEX IF NOT EXISTS idx_proc_breaker_tenant ON public.processor_circuit_breaker_states (tenant_id);
CREATE INDEX IF NOT EXISTS idx_proc_breaker_proc ON public.processor_circuit_breaker_states (processor_id);
CREATE INDEX IF NOT EXISTS idx_proc_breaker_state ON public.processor_circuit_breaker_states (state);

ALTER TABLE public.processor_circuit_breaker_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processor_circuit_breaker_states FORCE ROW LEVEL SECURITY;

CREATE POLICY processor_circuit_breaker_states_tenant_isolation ON public.processor_circuit_breaker_states
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
