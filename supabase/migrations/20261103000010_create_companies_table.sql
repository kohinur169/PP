-- path: supabase/migrations/20261103000010_create_companies_table.sql

-- ==============================================================================
-- KD SOLUTION IT: Companies & Sub-Merchant Tenant Schema Migration
-- Step 021: Companies & Sub-Merchant Tenant Schema Migration
-- Phase 2: Database Schema Foundations, UUIDv7 & Security Baselines
-- ==============================================================================

-- 1. Ensure companies table exists with base columns
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Acme Pay',
  slug text NOT NULL DEFAULT 'acme-pay',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1
);

-- 2. Add complete sub-merchant legal, risk, financial, and operational fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS legal_name varchar(255) NOT NULL DEFAULT 'Acme Legal Ltd',
  ADD COLUMN IF NOT EXISTS dba_name varchar(255) NOT NULL DEFAULT 'Acme Pay',
  ADD COLUMN IF NOT EXISTS business_type varchar(50) NOT NULL DEFAULT 'corporation',
  ADD COLUMN IF NOT EXISTS registration_number varchar(100) NOT NULL DEFAULT 'REG-000000',
  ADD COLUMN IF NOT EXISTS country char(2) NOT NULL DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS operating_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mcc varchar(4) NOT NULL DEFAULT '5411',
  ADD COLUMN IF NOT EXISTS risk_tier int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS custom_fee_percent numeric(7,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS custom_hold_days int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS reserve_percent numeric(7,4) NOT NULL DEFAULT 10.0000,
  ADD COLUMN IF NOT EXISTS reserve_hold_days int NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS default_currency varchar(3) NOT NULL DEFAULT 'USD';

-- 3. Add Domain Constraints (Risk Tier 1-3, Valid Statuses, USD Currency, Unique Country Registration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_companies_risk_tier') THEN
    ALTER TABLE public.companies ADD CONSTRAINT chk_companies_risk_tier CHECK (risk_tier IN (1, 2, 3));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_companies_status') THEN
    ALTER TABLE public.companies ADD CONSTRAINT chk_companies_status CHECK (status IN ('draft', 'under_review', 'active', 'suspended', 'closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_companies_default_currency') THEN
    ALTER TABLE public.companies ADD CONSTRAINT chk_companies_default_currency CHECK (default_currency = 'USD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_companies_country_registration') THEN
    ALTER TABLE public.companies ADD CONSTRAINT uq_companies_country_registration UNIQUE (country, registration_number);
  END IF;
END;
$$;

-- 4. Create Performance B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_companies_country ON public.companies(country);
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_risk_tier ON public.companies(risk_tier);
CREATE INDEX IF NOT EXISTS idx_companies_mcc ON public.companies(mcc);

-- 5. Attach Automated updated_at and Version Triggers
SELECT attach_standard_table_triggers('public.companies'::regclass);

-- 6. Enable and Force Row Level Security (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;

-- 7. Define Sub-Merchant Isolation RLS Policy
DROP POLICY IF EXISTS pol_companies_tenant_isolation ON public.companies;
CREATE POLICY pol_companies_tenant_isolation ON public.companies
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  id = get_current_company_id()
  OR
  company_id = get_current_company_id()
)
WITH CHECK (
  is_current_superadmin()
  OR
  id = get_current_company_id()
  OR
  company_id = get_current_company_id()
);

COMMENT ON TABLE public.companies IS 'Sub-merchant tenant entities with legal registration, country controls, risk tiers, and custom fee configurations';
