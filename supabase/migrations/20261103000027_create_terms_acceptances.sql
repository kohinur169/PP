-- path: supabase/migrations/20261103000027_create_terms_acceptances.sql

-- ==============================================================================
-- KD SOLUTION IT: Legal Terms Acceptance Engine with Version, IP & Timestamp Audit
-- Step 076: Legal Terms Acceptance Engine with Version, IP & Timestamp Audit
-- Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine
-- ==============================================================================

-- 1. Create terms_acceptances table
CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  policy_slug varchar(100) NOT NULL,
  policy_version varchar(50) NOT NULL,
  policy_hash varchar(64) NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ip_address varchar(45) NOT NULL,
  user_agent text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Audit & Verification Indexes
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user ON public.terms_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_company ON public.terms_acceptances(company_id);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_lookup ON public.terms_acceptances(user_id, policy_slug, policy_version);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_policy ON public.terms_acceptances(policy_slug, accepted_at DESC);

-- 3. Attach standard updated_at and version triggers
SELECT attach_standard_table_triggers('public.terms_acceptances'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms_acceptances FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy: Tenant isolation and Super Admin auditing
DROP POLICY IF EXISTS pol_terms_acceptances_isolation ON public.terms_acceptances;
CREATE POLICY pol_terms_acceptances_isolation ON public.terms_acceptances
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  user_id::text = current_setting('app.current_user_id', true)
  OR
  company_id::text = current_setting('app.current_company_id', true)
)
WITH CHECK (
  is_current_superadmin()
  OR
  user_id::text = current_setting('app.current_user_id', true)
  OR
  company_id::text = current_setting('app.current_company_id', true)
);
