-- Optional: create users table for app login (username + password + role).
-- Align RLS with your security model; below allows anon read for matching login rows (dev only).

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,
  role text not null check (role in ('ADMIN', 'STAFF'))
);

alter table public.users enable row level security;

create policy "users_select_login" on public.users for select using (true);
-- Do not grant broad insert/update/delete on users to anon in production.
