-- path: db/migrations/073_merchant_currency_settlements.down.sql

DROP POLICY IF EXISTS merchant_currency_settlements_tenant_isolation ON public.merchant_currency_settlements;
DROP TABLE IF EXISTS public.merchant_currency_settlements CASCADE;
