-- path: supabase/migrations/20261103000067_company_accounting_and_processor_bills.down.sql

DROP POLICY IF EXISTS processor_bill_records_tenant_isolation ON public.processor_bill_records;
DROP TABLE IF EXISTS public.processor_bill_records CASCADE;

DROP POLICY IF EXISTS company_accounting_entries_tenant_isolation ON public.company_accounting_entries;
DROP TABLE IF EXISTS public.company_accounting_entries CASCADE;
