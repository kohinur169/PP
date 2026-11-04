-- path: db/migrations/024_platform_liquidity.down.sql

DROP POLICY IF EXISTS pol_platform_liquidity_isolation ON public.platform_liquidity_buffers;
DROP TABLE IF EXISTS public.platform_liquidity_buffers CASCADE;
