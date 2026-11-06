-- path: db/migrations/093_create_document_tokens.down.sql

DROP POLICY IF EXISTS document_tokens_tenant_isolation ON public.document_tokens;
DROP TABLE IF EXISTS public.document_tokens CASCADE;
