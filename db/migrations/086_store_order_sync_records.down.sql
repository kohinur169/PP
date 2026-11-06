-- path: db/migrations/086_store_order_sync_records.down.sql

DROP POLICY IF EXISTS store_order_sync_records_tenant_isolation ON public.store_order_sync_records;
DROP TABLE IF EXISTS public.store_order_sync_records CASCADE;
