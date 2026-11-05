-- path: db/migrations/079_processor_circuit_breakers.down.sql

DROP POLICY IF EXISTS processor_circuit_breaker_states_tenant_isolation ON public.processor_circuit_breaker_states;
DROP TABLE IF EXISTS public.processor_circuit_breaker_states CASCADE;
