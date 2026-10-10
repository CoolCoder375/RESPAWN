-- Milestone 1: profiles only. The other tables, is_partner() and redeem_invite()
-- arrive in 0002 (Milestone 2), which also adds the pair_id foreign key.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  season_start date not null default current_date,
  timezone text not null default 'Asia/Kolkata',
  pair_id uuid,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Column-level grants: users may write their own name, season and timezone,
-- but never pair_id (only redeem_invite / unpair functions change that).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, display_name, season_start, timezone) on public.profiles to authenticated;
grant update (display_name, season_start, timezone) on public.profiles to authenticated;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: insert own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
