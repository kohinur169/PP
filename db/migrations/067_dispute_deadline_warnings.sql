-- path: db/migrations/067_dispute_deadline_warnings.sql

-- Add 7d, 48h, 12h warning tracking columns to payment_disputes
ALTER TABLE public.payment_disputes
  ADD COLUMN IF NOT EXISTS warning_7d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warning_48h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warning_12h_sent_at TIMESTAMPTZ;
