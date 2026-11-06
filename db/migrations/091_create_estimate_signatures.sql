-- path: db/migrations/091_create_estimate_signatures.sql

-- Table for legal electronic signature audit evidence for estimates and contracts
CREATE TABLE IF NOT EXISTS public.estimate_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  signer_name VARCHAR(255) NOT NULL,
  signer_email VARCHAR(255) NOT NULL,
  consent_checkbox BOOLEAN NOT NULL CHECK (consent_checkbox = true),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT NOT NULL,
  document_hash VARCHAR(64) NOT NULL,
  signature_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_signatures_tenant ON public.estimate_signatures (tenant_id);
CREATE INDEX IF NOT EXISTS idx_estimate_signatures_estimate ON public.estimate_signatures (estimate_id);

ALTER TABLE public.estimate_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_signatures FORCE ROW LEVEL SECURITY;

CREATE POLICY estimate_signatures_tenant_isolation ON public.estimate_signatures
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
