-- path: db/migrations/039_payment_routing_rules.sql

CREATE TABLE IF NOT EXISTS public.payment_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_name VARCHAR(128) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  target_provider VARCHAR(32) NOT NULL
    CHECK (target_provider IN ('nmi', 'stripe_connect', 'rainforest', 'airwallex', 'payoneer')),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_tenant ON public.payment_routing_rules (tenant_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_priority ON public.payment_routing_rules (priority ASC);
CREATE INDEX IF NOT EXISTS idx_routing_rules_active ON public.payment_routing_rules (is_active);

ALTER TABLE public.payment_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_routing_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_routing_rules_tenant_isolation ON public.payment_routing_rules
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
