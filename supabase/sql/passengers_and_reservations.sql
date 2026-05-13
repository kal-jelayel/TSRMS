-- Run after schedules table exists. Creates passengers + reservations and dev RLS.

create table if not exists public.passengers (
  id uuid primary key default gen_random_uuid(),
  national_id text not null unique,
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete restrict,
  passenger_id uuid not null references public.passengers (id) on delete restrict,
  full_name text not null,
  national_id text not null,
  phone text not null,
  seats integer not null check (seats > 0),
  total_price numeric(12, 2) not null,
  confirmation_code text not null unique,
  status text not null default 'CONFIRMED',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text
);

create index if not exists reservations_schedule_id_idx on public.reservations (schedule_id);
create index if not exists reservations_passenger_id_idx on public.reservations (passenger_id);

alter table public.passengers enable row level security;
alter table public.reservations enable row level security;

create policy "passengers_select_all" on public.passengers for select using (true);
create policy "passengers_insert_all" on public.passengers for insert with check (true);
create policy "passengers_update_all" on public.passengers for update using (true) with check (true);
create policy "passengers_delete_all" on public.passengers for delete using (true);

create policy "reservations_select_all" on public.reservations for select using (true);
create policy "reservations_insert_all" on public.reservations for insert with check (true);
create policy "reservations_update_all" on public.reservations for update using (true) with check (true);
create policy "reservations_delete_all" on public.reservations for delete using (true);
