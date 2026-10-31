-- A Respawn day ends at 4 am local time, not midnight.
--
-- Night quests ("Lights out by 1:00 am", "No screens before bed", the journal) happen after
-- midnight for late sleepers. With days ending at midnight they could only be ticked before doing
-- them, and by morning the day was locked. Now 1 am still belongs to the evening before.
--
--   * respawn_day(tz): the day it is now, in `tz`, with the 4 am cut-off.
--   * Quests, ticks, the journal and the cheer limit all use it. src/lib/dates.ts mirrors it.
--   * Stored days don't change: a quest's `day` is still a calendar date.

-- 1. The day ------------------------------------------------------------------------

create function public.respawn_day(tz text, at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select ((at - interval '4 hours') at time zone tz)::date;
$$;

-- 2. Quests -------------------------------------------------------------------------

-- Same as 0006, except the 4 am day and the journal quest ticked by sync_journal_quest (0007),
-- which also counts an entry that is on paper.
create or replace function public.assign_quests()
returns setof public.quests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  profile public.profiles;
  today date;
  answers jsonb;
  day_x integer;
  tier integer;
  lines integer;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select * into profile from public.profiles where id = uid;
  if not found then
    raise exception 'Set up your profile first';
  end if;
  today := public.respawn_day(profile.timezone);

  -- Two calls at once (app start + refetch) must not both generate.
  perform pg_advisory_xact_lock(hashtext('assign_quests:' || uid::text));

  if not exists (select 1 from public.quests q where q.user_id = uid and q.day = today) then
    select q.answers into answers from public.questionnaires q where q.user_id = uid;
    if answers is null then
      raise exception 'Answer the questionnaire first';
    end if;

    -- Day X: the run through yesterday + today, capped by the season's calendar day.
    day_x := least(
      public.run_length(uid, today - 1) + 1,
      greatest(today - profile.season_start + 1, 1)
    );
    tier := case answers ->> 'intensity'
      when 'gentle' then case when day_x <= 20 then 1 when day_x <= 35 then 2 when day_x <= 50 then 3 else 4 end
      else case when day_x <= 15 then 1 when day_x <= 30 then 2 when day_x <= 45 then 3 else 4 end
        + case when answers ->> 'intensity' = 'hard' then 1 else 0 end
    end;
    tier := least(tier, 4);

    insert into public.quests (user_id, day, slot, quest_key, title, detail, category, rp, tier)
    select uid, today, (row_number() over (order by b.slot))::smallint,
      b.quest_key, b.title, b.detail, b.category, b.rp, tier
    from public.build_quests(answers, tier, today) b
    where b.quest_key <> 'mind.journal';
  end if;

  if not exists (
    select 1 from public.quests q
    where q.user_id = uid and q.day = today and q.quest_key in ('journal.write', 'mind.journal')
  ) then
    select max(q.tier) into tier from public.quests q where q.user_id = uid and q.day = today;
    lines := public.journal_lines_needed(tier);
    insert into public.quests (user_id, day, slot, quest_key, title, detail, category, rp, tier)
    select uid, today, max(q.slot) + 1, 'journal.write',
      format('Write %s in your journal', case when lines = 1 then '1 line' else lines || ' lines' end),
      'How did today go? Ticks itself when you save', 'mind', 2, max(q.tier)
    from public.quests q where q.user_id = uid and q.day = today;

    -- An entry written before the quest existed still counts.
    perform public.sync_journal_quest(uid, today);
  end if;

  return query
    select * from public.quests q where q.user_id = uid and q.day = today order by q.slot;
end;
$$;

-- Same as 0006, except the 4 am day (10 minutes' grace after it ends).
create or replace function public.set_quest_done(quest uuid, done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  quest_day date;
  key text;
  tz text;
begin
  select q.day, q.quest_key, p.timezone into quest_day, key, tz
  from public.quests q join public.profiles p on p.id = q.user_id
  where q.id = quest and q.user_id = uid;
  if not found then
    raise exception 'Quest not found';
  end if;
  if key in ('journal.write', 'mind.journal') then
    raise exception 'Write in your journal to complete this quest';
  end if;
  if quest_day not in (public.respawn_day(tz), public.respawn_day(tz, now() - interval '10 minutes')) then
    raise exception 'Only today’s quests can be ticked';
  end if;
  update public.quests
    set done_at = case when done then coalesce(done_at, now()) end
    where id = quest;
end;
$$;

-- 3. Journal ------------------------------------------------------------------------

-- Same as 0007, except the 4 am day.
create or replace function public.assert_journal_day(uid uuid, day date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz text;
begin
  select p.timezone into tz from public.profiles p where p.id = uid;
  if not found then
    raise exception 'Set up your profile first';
  end if;
  if day not in (public.respawn_day(tz), public.respawn_day(tz, now() - interval '10 minutes')) then
    raise exception 'Only today’s journal can be written';
  end if;
end;
$$;

-- 4. Cheers -------------------------------------------------------------------------

-- Same as 0002, except the 4 am day.
create or replace function public.enforce_cheer_limit()
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
      and public.respawn_day(tz, created_at) = public.respawn_day(tz);

  if sent_today >= 5 then
    raise exception 'You''ve sent 5 cheers today. Try again tomorrow.';
  end if;
  return new;
end;
$$;

-- 5. Function privileges --------------------------------------------------------------

revoke execute on function public.respawn_day(text, timestamptz) from public, anon;
grant execute on function public.respawn_day(text, timestamptz) to authenticated;
