-- path: db/migrations/005_tenant_session_functions.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 005_tenant_session_functions
-- Step 029: Database Migration Runner & Forward/Rollback Testing Harness
-- ==============================================================================

DROP FUNCTION IF EXISTS public.reset_tenant_context();
DROP FUNCTION IF EXISTS public.set_current_superadmin(boolean);
DROP FUNCTION IF EXISTS public.is_current_superadmin();
DROP FUNCTION IF EXISTS public.set_current_company_id(uuid);
DROP FUNCTION IF EXISTS public.get_current_company_id();
