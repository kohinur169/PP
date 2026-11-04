-- path: db/migrations/024_platform_liquidity.sql

-- ==============================================================================
-- KD SOLUTION IT: Platform Emergency Liquidity Buffer & Company Funds Capitalization
-- Step 080: Platform Emergency Liquidity Buffer & Company Funds Capitalization
-- Phase 6: Compliance Framework, Legal Policies & CMS Policy Engine
-- ==============================================================================

-- 1. Create platform_liquidity_buffers table
CREATE TABLE IF NOT EXISTS public.platform_liquidity_buffers (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  buffer_balance numeric(18, 4) NOT NULL DEFAULT 0.0000,
  minimum_threshold numeric(18, 4) NOT NULL DEFAULT 50000.0000,
  peak_chargeback_30d numeric(18, 4) NOT NULL DEFAULT 0.0000,
  delayed_settlements_pending numeric(18, 4) NOT NULL DEFAULT 0.0000,
  reserve_allocations jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'healthy',
  last_evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_alert_sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz NULL,
  version int NOT NULL DEFAULT 1,
  CONSTRAINT chk_liquidity_status CHECK (status IN ('healthy', 'warning', 'critical_deficit')),
  CONSTRAINT chk_positive_buffer_balance CHECK (buffer_balance >= 0.0000),
  CONSTRAINT chk_positive_min_threshold CHECK (minimum_threshold >= 0.0000)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_platform_liquidity_company ON public.platform_liquidity_buffers(company_id);
CREATE INDEX IF NOT EXISTS idx_platform_liquidity_status ON public.platform_liquidity_buffers(status);

-- 3. Attach standard triggers
SELECT attach_standard_table_triggers('public.platform_liquidity_buffers'::regclass);

-- 4. Enable and Force Row Level Security (RLS)
ALTER TABLE public.platform_liquidity_buffers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_liquidity_buffers FORCE ROW LEVEL SECURITY;

-- 5. RLS Security Policy: Restricted to Finance Ops, Super Admin, and CEO
DROP POLICY IF EXISTS pol_platform_liquidity_isolation ON public.platform_liquidity_buffers;
CREATE POLICY pol_platform_liquidity_isolation ON public.platform_liquidity_buffers
FOR ALL TO PUBLIC
USING (
  is_current_superadmin()
  OR
  current_setting('app.current_user_role', true) IN ('finance_ops', 'ceo')
  OR
  company_id::text = current_setting('app.current_tenant_id', true)
)
WITH CHECK (
  is_current_superadmin()
  OR
  current_setting('app.current_user_role', true) IN ('finance_ops', 'ceo')
  OR
  company_id::text = current_setting('app.current_tenant_id', true)
);
