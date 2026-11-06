-- path: supabase/migrations/20261103000003_auth_hooks_and_profile_sync.sql

-- ==============================================================================
-- KD SOLUTION IT: Supabase Auth Hooks & Public Profile Sync
-- Step 012: Automatic User Sync & Tenant Membership Provisioning
-- ==============================================================================

-- 1. Trigger function syncing auth.users -> public.users and public.tenant_memberships
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_role varchar(32);
  v_full_name varchar(255);
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'owner');
  
  -- Insert or update into public.users
  INSERT INTO public.users (id, email, full_name, status, is_superadmin)
  VALUES (
    NEW.id,
    NEW.email::citext,
    v_full_name,
    'active',
    COALESCE((NEW.raw_user_meta_data->>'is_superadmin')::boolean, false)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = clock_timestamp();

  -- If tenant_id metadata is provided, assign initial membership
  IF (NEW.raw_user_meta_data->>'tenant_id') IS NOT NULL THEN
    BEGIN
      v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
      
      INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
      VALUES (v_tenant_id, NEW.id, v_role, 'active')
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = clock_timestamp();
    EXCEPTION WHEN OTHERS THEN
      -- Log or ignore if tenant does not exist yet during onboarding flow
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
