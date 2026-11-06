-- path: db/migrations/092_create_invoice_reminders.sql

-- Table for overdue invoice client reminders queue enforcing non-retry payment policy
CREATE TABLE IF NOT EXISTS public.invoice_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_step INT NOT NULL
    CHECK (reminder_step IN (1, 3, 7)),
  scheduled_for DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_tenant ON public.invoice_reminders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice ON public.invoice_reminders (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_sched ON public.invoice_reminders (status, scheduled_for);

ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminders FORCE ROW LEVEL SECURITY;

CREATE POLICY invoice_reminders_tenant_isolation ON public.invoice_reminders
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
