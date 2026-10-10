-- Milestone 2: pairs, invites, tasks, completions, cheers, coach messages,
-- the is_partner() helper, invite/pairing functions and Row Level Security.
--
-- Conventions:
--   * Every table has RLS on, and privileges are granted per column/operation.
--     Supabase grants everything to anon/authenticated by default, so each table
--     starts with `revoke all` and grants back only what the app needs.
--   * `(select auth.uid())` instead of `auth.uid()` so Postgres evaluates it once per query.
--   * Pairing state lives in profiles.pair_id and is only changed by security definer functions.

-- ---------------------------------------------------------------------------
-- pairs
-- ---------------------------------------------------------------------------

create table public.pairs (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Set by unpair(). The row is kept as history; the active link is profiles.pair_id.
  ended_at timestamptz,
  check (user_a <> user_b)
);

alter table public.profiles
  add constraint profiles_pair_id_fkey
  foreign key (pair_id) references public.pairs (id) on delete set null;

create index profiles_pair_id_idx on public.profiles (pair_id);

-- ---------------------------------------------------------------------------
-- is_partner(other): true when `other` shares the caller's active pair.
-- security definer so policies can call it without recursing into profiles' RLS.
-- ---------------------------------------------------------------------------

create function public.is_partner(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles me
    join public.profiles them on them.pair_id = me.pair_id
    where me.id = (select auth.uid())
      and them.id = other
      and them.id <> me.id
  );
$$;

-- Profiles: you can now also read your partner's row (replaces the 0001 policy).
drop policy "profiles: read own" on public.profiles;

create policy "profiles: read own and partner"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_partner(id));

alter table public.pairs enable row level security;
revoke all on public.pairs from anon, authenticated;
grant select on public.pairs to authenticated;

create policy "pairs: members read"
  on public.pairs for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- ---------------------------------------------------------------------------
-- pair_invites: created and redeemed only through functions below.
-- ---------------------------------------------------------------------------

create table public.pair_invites (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null
);

create index pair_invites_created_by_idx on public.pair_invites (created_by);

alter table public.pair_invites enable row level security;
revoke all on public.pair_invites from anon, authenticated;
grant select on public.pair_invites to authenticated;

create policy "pair_invites: creator reads"
  on public.pair_invites for select to authenticated
  using (created_by = (select auth.uid()));

-- create_invite(): returns a fresh 6-character code valid for 48 hours.
-- Any older unused invite from the same user is expired so only one code is live.
create function public.create_invite()
returns public.pair_invites
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  -- No 0/O or 1/I so codes are easy to read aloud.
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  new_code text;
  invite public.pair_invites;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.profiles where id = me and pair_id is not null) then
    raise exception 'You already have a partner';
  end if;

  update public.pair_invites
    set expires_at = now()
    where created_by = me and used_at is null and expires_at > now();

  loop
    bytes := extensions.gen_random_bytes(6);
    new_code := '';
    for i in 0..5 loop
      new_code := new_code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.pair_invites (code, created_by)
        values (new_code, me)
        returning * into invite;
      return invite;
    exception when unique_violation then
      -- Astronomically rare; try another code.
    end;
  end loop;
end;
$$;

-- redeem_invite(code): pairs the caller with the invite's creator.
create function public.redeem_invite(invite_code text)
returns public.pairs
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  invite public.pair_invites;
  new_pair public.pairs;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select * into invite
    from public.pair_invites
    where code = upper(btrim(invite_code))
    for update;

  if not found then
    raise exception 'That code doesn''t exist';
  elsif invite.used_at is not null then
    raise exception 'That code has already been used';
  elsif invite.expires_at <= now() then
    raise exception 'That code has expired';
  elsif invite.created_by = me then
    raise exception 'You can''t use your own code';
  end if;

  -- Lock both profiles in a fixed order so two concurrent redeems can't deadlock or double-pair.
  perform 1 from public.profiles
    where id in (me, invite.created_by)
    order by id
    for update;

  if exists (select 1 from public.profiles where id = me and pair_id is not null) then
    raise exception 'You already have a partner';
  end if;
  if exists (select 1 from public.profiles where id = invite.created_by and pair_id is not null) then
    raise exception 'That person already has a partner';
  end if;
  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'Finish setting up your profile first';
  end if;

  insert into public.pairs (user_a, user_b)
    values (invite.created_by, me)
    returning * into new_pair;

  update public.profiles set pair_id = new_pair.id where id in (me, invite.created_by);
  update public.pair_invites set used_at = now(), used_by = me where code = invite.code;

  return new_pair;
end;
$$;

-- unpair(): removes the link for both users. Tasks and history are kept.
create function public.unpair()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  current_pair uuid;
begin
  select pair_id into current_pair from public.profiles where id = me;
  if current_pair is null then
    return;
  end if;

  update public.profiles set pair_id = null where pair_id = current_pair;
  update public.pairs set ended_at = now() where id = current_pair;
end;
$$;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  kind text not null check (kind in ('daily', 'once')),
  category text check (category in ('body', 'mind', 'focus', 'recovery', 'other')),
  position integer not null default 0,
  -- Archived instead of deleted so completion history survives.
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index tasks_user_id_idx on public.tasks (user_id, archived, position);

alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;
grant select on public.tasks to authenticated;
grant insert (id, title, kind, category, position) on public.tasks to authenticated;
grant update (title, category, position, archived) on public.tasks to authenticated;

create policy "tasks: read own and partner"
  on public.tasks for select to authenticated
  using (user_id = (select auth.uid()) or public.is_partner(user_id));

create policy "tasks: insert own"
  on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "tasks: update own"
  on public.tasks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- task_completions: one row per task per local day it was ticked.
-- ---------------------------------------------------------------------------

create table public.task_completions (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The user's local calendar day, computed on the client from profiles.timezone.
  day date not null,
  completed_at timestamptz not null default now(),
  primary key (task_id, day)
);

create index task_completions_user_day_idx on public.task_completions (user_id, day);

alter table public.task_completions enable row level security;
revoke all on public.task_completions from anon, authenticated;
grant select, delete on public.task_completions to authenticated;
grant insert (task_id, day) on public.task_completions to authenticated;

create policy "task_completions: read own and partner"
  on public.task_completions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_partner(user_id));

-- Only for your own tasks, and only for "today" give or take a day:
-- every timezone's local date is within one day of UTC's, and this stops backfilling streaks.
create policy "task_completions: insert own for today"
  on public.task_completions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = (select auth.uid())
    )
    and day between (now() at time zone 'utc')::date - 1 and (now() at time zone 'utc')::date + 1
  );

create policy "task_completions: delete own"
  on public.task_completions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- cheers
-- ---------------------------------------------------------------------------

create table public.cheers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  message text not null check (message in ('Keep going', 'Proud of you', 'You''ve got this')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index cheers_to_user_idx on public.cheers (to_user, seen_at);
create index cheers_from_user_idx on public.cheers (from_user, created_at);

alter table public.cheers enable row level security;
revoke all on public.cheers from anon, authenticated;
grant select on public.cheers to authenticated;
grant insert (to_user, message) on public.cheers to authenticated;
grant update (seen_at) on public.cheers to authenticated;

create policy "cheers: sender or receiver reads"
  on public.cheers for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));

create policy "cheers: send to partner"
  on public.cheers for insert to authenticated
  with check (from_user = (select auth.uid()) and public.is_partner(to_user));

create policy "cheers: receiver marks seen"
  on public.cheers for update to authenticated
  using (to_user = (select auth.uid()))
  with check (to_user = (select auth.uid()));

-- 5 cheers per sender per local day. A trigger (not a policy) so the app gets a readable error.
create function public.enforce_cheer_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  sent_today integer;
begin
  select coalesce(timezone, 'UTC') into tz from public.profiles where id = new.from_user;

  select count(*) into sent_today
    from public.cheers
    where from_user = new.from_user
      and (created_at at time zone tz)::date = (now() at time zone tz)::date;

  if sent_today >= 5 then
    raise exception 'You''ve sent 5 cheers today. Try again tomorrow.';
  end if;
  return new;
end;
$$;

create trigger cheers_daily_limit
  before insert on public.cheers
  for each row execute function public.enforce_cheer_limit();

-- ---------------------------------------------------------------------------
-- coach_messages: private to the owner. Only the `coach` Edge Function
-- (service role, which bypasses RLS) writes rows, so the app gets read access only.
-- ---------------------------------------------------------------------------

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'coach')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index coach_messages_user_created_idx on public.coach_messages (user_id, created_at desc);

alter table public.coach_messages enable row level security;
revoke all on public.coach_messages from anon, authenticated;
grant select on public.coach_messages to authenticated;

create policy "coach_messages: owner reads"
  on public.coach_messages for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Function privileges: signed-in users only.
-- ---------------------------------------------------------------------------

revoke execute on function public.is_partner(uuid) from public, anon;
revoke execute on function public.create_invite() from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.unpair() from public, anon;
revoke execute on function public.enforce_cheer_limit() from public, anon, authenticated;

grant execute on function public.is_partner(uuid) to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.unpair() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the Duo tab listens for partner ticks, task edits and cheers.
-- Realtime applies the select policies above, so you only receive rows you may read.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.tasks, public.task_completions, public.cheers;
