-- Run this in Supabase SQL Editor (or via migrations) before using the app.
-- Table name: public.schedules

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  train_name text not null,
  origin text not null,
  destination text not null,
  departure_date date not null,
  departure_time text not null default '00:00',
  departure_datetime timestamptz,
  price numeric(12, 2) not null,
  total_seats integer not null check (total_seats >= 0),
  available_seats integer not null check (available_seats >= 0),
  status text not null default 'ACTIVE'
);

alter table public.schedules add column if not exists departure_time text;

alter table public.schedules enable row level security;

-- Development-friendly policy: allow anon key full access.
-- Tighten policies (auth.uid(), service role only, etc.) before production.
create policy "schedules_select_all" on public.schedules for select using (true);
create policy "schedules_insert_all" on public.schedules for insert with check (true);
create policy "schedules_update_all" on public.schedules for update using (true) with check (true);
create policy "schedules_delete_all" on public.schedules for delete using (true);
