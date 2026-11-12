-- Run in SQL Editor during the deployment described in README.md.
BEGIN;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

REVOKE ALL PRIVILEGES ON public.users, public.passengers, public.reservations
  FROM PUBLIC, anon, authenticated;

-- Table-level REVOKE alone leaves any existing column-level grants in place.
DO $$
DECLARE
  target text;
  column_list text;
BEGIN
  FOREACH target IN ARRAY ARRAY['users', 'passengers', 'reservations'] LOOP
    SELECT string_agg(quote_ident(column_name), ', ')
      INTO column_list
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = target;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON public.%I FROM PUBLIC, anon, authenticated',
      column_list, target
    );
  END LOOP;
END;
$$;

-- The existing cancellation flow still uses only these reservation fields.
GRANT SELECT (id, schedule_id, seats, status, confirmation_code)
  ON public.reservations TO anon;
GRANT UPDATE (status, cancelled_at, cancellation_reason)
  ON public.reservations TO anon;

GRANT SELECT, UPDATE (password) ON public.users TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.passengers TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.reservations TO service_role;
GRANT SELECT, UPDATE (available_seats) ON public.schedules TO service_role;

-- The caller encrypts both phone copies before calling this function.
-- Booking, passenger upsert, and seat deduction commit together.
DROP FUNCTION IF EXISTS public.tsrms_create_reservation(uuid, integer, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.tsrms_create_reservation(
  p_schedule_id text,
  p_seats integer,
  p_national_id text,
  p_full_name text,
  p_passenger_phone text,
  p_reservation_phone text,
  p_code text
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  trip record;
  schedule_key public.schedules.id%TYPE;
  passenger_key public.passengers.id%TYPE;
BEGIN
  IF p_seats IS NULL OR p_seats < 1 THEN
    RAISE EXCEPTION 'Invalid seats.' USING ERRCODE = 'PT400';
  END IF;
  IF p_passenger_phone IS NULL OR p_passenger_phone NOT LIKE 'enc:v1:%'
     OR p_reservation_phone IS NULL OR p_reservation_phone NOT LIKE 'enc:v1:%' THEN
    RAISE EXCEPTION 'Encrypted phone values required.';
  END IF;

  -- Existing projects use bigint IDs. New installations use UUIDs.
  BEGIN
    schedule_key := p_schedule_id;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'No active schedule found.' USING ERRCODE = 'PT409';
  END;

  SELECT status, available_seats, price INTO trip
    FROM public.schedules WHERE id = schedule_key FOR UPDATE;
  IF NOT FOUND OR trip.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'No active schedule found.' USING ERRCODE = 'PT409';
  END IF;
  IF trip.available_seats < p_seats THEN
    RAISE EXCEPTION 'Insufficient seats.' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.passengers (national_id, full_name, phone)
    VALUES (p_national_id, p_full_name, p_passenger_phone)
    ON CONFLICT (national_id) DO UPDATE
      SET full_name = excluded.full_name, phone = excluded.phone
    RETURNING id INTO passenger_key;

  INSERT INTO public.reservations (
    schedule_id, passenger_id, full_name, national_id, phone,
    seats, total_price, confirmation_code, status
  ) VALUES (
    schedule_key, passenger_key, p_full_name, p_national_id, p_reservation_phone,
    p_seats, p_seats * trip.price, p_code, 'CONFIRMED'
  );

  UPDATE public.schedules SET available_seats = available_seats - p_seats
    WHERE id = schedule_key;
  RETURN p_code;
END;
$$;

REVOKE ALL ON FUNCTION public.tsrms_create_reservation(text, integer, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tsrms_create_reservation(text, integer, text, text, text, text, text)
  TO service_role;

-- Local maintenance commands check the active grants before writing data.
CREATE OR REPLACE FUNCTION public.tsrms_phone_access_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon'::name, 'authenticated'::name]) AS api_roles(role_name)
    WHERE has_any_column_privilege(role_name, 'public.users', 'SELECT, INSERT, UPDATE, REFERENCES')
       OR has_table_privilege(role_name, 'public.users', 'DELETE, TRUNCATE')
       OR has_any_column_privilege(role_name, 'public.passengers', 'SELECT, INSERT, UPDATE')
       OR has_table_privilege(role_name, 'public.passengers', 'DELETE, TRUNCATE')
       OR has_column_privilege(role_name, 'public.reservations', 'phone', 'SELECT, INSERT, UPDATE')
       OR has_any_column_privilege(role_name, 'public.reservations', 'INSERT')
       OR has_table_privilege(role_name, 'public.reservations', 'DELETE, TRUNCATE')
       OR has_function_privilege(role_name,
            'public.tsrms_create_reservation(text,integer,text,text,text,text,text)', 'EXECUTE')
  );
$$;

REVOKE ALL ON FUNCTION public.tsrms_phone_access_ready() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tsrms_phone_access_ready() TO service_role;

DO $$
BEGIN
  IF NOT public.tsrms_phone_access_ready() THEN
    RAISE EXCEPTION 'Public access to protected data is still granted. Check inherited privileges.';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
