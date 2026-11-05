-- path: db/migrations/067_dispute_deadline_warnings.down.sql

ALTER TABLE public.payment_disputes
  DROP COLUMN IF EXISTS warning_7d_sent_at,
  DROP COLUMN IF EXISTS warning_48h_sent_at,
  DROP COLUMN IF EXISTS warning_12h_sent_at;
