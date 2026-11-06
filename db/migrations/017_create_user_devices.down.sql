-- path: db/migrations/017_create_user_devices.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 017_create_user_devices
-- Step 056: Per-Device Proof Key & Hardware Fingerprinting Engine
-- Phase 4: Authentication, LR-022 Session Engine & 2FA / Turnstile
-- ==============================================================================

DROP POLICY IF EXISTS pol_user_devices_isolation ON public.user_devices;
DROP TABLE IF EXISTS public.user_devices CASCADE;
