-- path: db/migrations/012_create_files_table.down.sql

-- ==============================================================================
-- KD SOLUTION IT: Rollback 012_create_files_table
-- Step 042: File Metadata Schema & Company Isolation Migration
-- Phase 3: Cryptography, Key Management & Secure Storage Layer
-- ==============================================================================

DROP TABLE IF EXISTS public.files CASCADE;
