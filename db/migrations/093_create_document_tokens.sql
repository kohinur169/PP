-- path: db/migrations/093_create_document_tokens.sql

-- Table for high-entropy client tokenized links (i/[token] & e/[token]) with rate limiting & expiration
CREATE TABLE IF NOT EXISTS public.document_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  token_type VARCHAR(16) NOT NULL
    CHECK (token_type IN ('invoice', 'estimate')),
  document_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  access_count INT NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_tokens_tenant ON public.document_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_tokens_hash ON public.document_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_document_tokens_doc ON public.document_tokens (token_type, document_id);

ALTER TABLE public.document_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY document_tokens_tenant_isolation ON public.document_tokens
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
