-- path: db/migrations/078_processor_routing_simulations.sql

-- Table for tracking multi-criteria processor routing evaluations and simulator traces
CREATE TABLE IF NOT EXISTS public.processor_routing_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  simulation_reference VARCHAR(64) NOT NULL UNIQUE,
  input_payload JSONB NOT NULL DEFAULT '{}',
  selected_processor VARCHAR(32) NOT NULL
    CHECK (selected_processor IN ('nmi', 'stripe_connect', 'rainforest', 'airwallex', 'payoneer')),
  waterfall_order JSONB NOT NULL DEFAULT '[]',
  matched_rule_id UUID REFERENCES public.payment_routing_rules(id),
  estimated_cost_usd NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  reasoning TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_sim_tenant ON public.processor_routing_simulations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_routing_sim_processor ON public.processor_routing_simulations (selected_processor);

ALTER TABLE public.processor_routing_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processor_routing_simulations FORCE ROW LEVEL SECURITY;

CREATE POLICY processor_routing_simulations_tenant_isolation ON public.processor_routing_simulations
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
