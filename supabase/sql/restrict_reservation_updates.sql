BEGIN;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

REVOKE UPDATE ON TABLE public.reservations FROM anon;

GRANT UPDATE (status, cancelled_at, cancellation_reason)
ON TABLE public.reservations TO anon;

COMMIT;
