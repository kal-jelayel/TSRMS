-- Add denormalized passenger fields on reservations (NOT NULL after backfill).
-- Run once after passengers + reservations exist.

alter table public.reservations
  add column if not exists full_name text,
  add column if not exists national_id text,
  add column if not exists phone text;

update public.reservations r
set
  full_name = coalesce(nullif(trim(r.full_name), ''), p.full_name),
  national_id = coalesce(nullif(trim(r.national_id), ''), p.national_id),
  phone = coalesce(nullif(trim(r.phone), ''), p.phone)
from public.passengers p
where r.passenger_id = p.id
  and (
    r.full_name is null
    or trim(r.full_name) = ''
    or r.national_id is null
    or trim(r.national_id) = ''
    or r.phone is null
    or trim(r.phone) = ''
  );

update public.reservations
set
  full_name = coalesce(full_name, 'Unknown'),
  national_id = coalesce(national_id, 'unknown'),
  phone = coalesce(phone, 'unknown')
where full_name is null or national_id is null or phone is null;

alter table public.reservations alter column full_name set not null;
alter table public.reservations alter column national_id set not null;
alter table public.reservations alter column phone set not null;
