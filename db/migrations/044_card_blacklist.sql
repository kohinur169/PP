-- path: db/migrations/044_card_blacklist.sql

CREATE TABLE IF NOT EXISTS public.card_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  card_fingerprint VARCHAR(128) NOT NULL,
  reason TEXT NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'fraud'
    CHECK (category IN ('fraud', 'stolen_card', 'excessive_chargebacks', 'compliance_sanction', 'manual_block')),
  added_by UUID NOT NULL REFERENCES public.users(id),
  added_by_email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_blacklist_tenant ON public.card_blacklist (tenant_id);
CREATE INDEX IF NOT EXISTS idx_card_blacklist_fingerprint ON public.card_blacklist (card_fingerprint);
CREATE INDEX IF NOT EXISTS idx_card_blacklist_active ON public.card_blacklist (is_active);

ALTER TABLE public.card_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_blacklist FORCE ROW LEVEL SECURITY;

CREATE POLICY card_blacklist_tenant_isolation ON public.card_blacklist
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
