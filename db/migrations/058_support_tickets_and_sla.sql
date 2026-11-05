-- path: db/migrations/058_support_tickets_and_sla.sql

-- 1. Support tickets table with SLA tracking
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  creator_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to_user_id UUID REFERENCES public.users(id),
  ticket_number VARCHAR(32) NOT NULL UNIQUE,
  category VARCHAR(32) NOT NULL
    CHECK (category IN ('monetary_urgent', 'stuck_payment', 'general', 'technical')),
  priority VARCHAR(32) NOT NULL
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status VARCHAR(32) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting_on_merchant', 'resolved', 'closed')),
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  sla_target_hours INT NOT NULL,
  first_response_at TIMESTAMPTZ,
  sla_compliant BOOLEAN,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON public.support_tickets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON public.support_tickets (company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets (status);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets FORCE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_tenant_isolation ON public.support_tickets
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 2. Support ticket messages and file attachment references
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_role VARCHAR(32) NOT NULL
    CHECK (sender_role IN ('merchant', 'support')),
  body TEXT NOT NULL,
  attachment_file_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_ticket_messages (ticket_id);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY support_ticket_messages_tenant_isolation ON public.support_ticket_messages
  AS RESTRICTIVE
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
