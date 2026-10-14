-- Journal: a daily entry, and a quest that only writing it can complete (see QUESTS.md).
--
--   * journal_entries: one entry per user per local day. Private: not even the partner reads it.
--   * save_journal(): the only way to write; only today's entry (10 minutes' grace after midnight).
--     Saving ticks today's journal quest once the entry has enough lines, and unticks it if not.
--   * Every day's quests now include "journal.write". It replaces the optional mind.journal quest
--     and can't be ticked with set_quest_done().

-- 1. Entries --------------------------------------------------------------------

create table public.journal_entries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from anon, authenticated;
grant select on public.journal_entries to authenticated;

create policy "journal_entries: read own"
  on public.journal_entries for select to authenticated
  using (user_id = (select auth.uid()));

-- Lines the journal quest asks for at each tier (Foundation .. Master).
create function public.journal_lines_needed(tier integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (array[1, 2, 3, 5])[least(greatest(tier, 1), 4)];
$$;

-- Non-blank lines. The app counts the same way (src/lib/journal.ts).
create function public.journal_line_count(body text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer from regexp_split_to_table(body, '\r?\n') l where btrim(l) <> '';
$$;

-- 2. Writing --------------------------------------------------------------------

create function public.save_journal(day date, body text)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  tz text;
  clean text := btrim(save_journal.body, E' \t\r\n');
  entry public.journal_entries;
begin
  select p.timezone into tz from public.profiles p where p.id = uid;
  if not found then
    raise exception 'Set up your profile first';
  end if;
  if day not in (
    (now() at time zone tz)::date,
    ((now() - interval '10 minutes') at time zone tz)::date
  ) then
    raise exception 'Only today’s journal can be written';
  end if;

  if clean = '' then
    delete from public.journal_entries j where j.user_id = uid and j.day = save_journal.day;
  else
    insert into public.journal_entries as j (user_id, day, body)
    values (uid, save_journal.day, clean)
    on conflict (user_id, day) do update set body = excluded.body, updated_at = now()
    returning * into entry;
  end if;

  update public.quests q
    set done_at = case
      when clean <> '' and public.journal_line_count(clean) >= public.journal_lines_needed(q.tier)
        then coalesce(q.done_at, now())
    end
    where q.user_id = uid and q.day = save_journal.day
      and q.quest_key in ('journal.write', 'mind.journal');

  return entry;
end;
$$;

-- 3. The journal quest, every day -------------------------------------------------

-- Today's quests from build_quests(), minus the optional journal quest, plus the daily one.
-- Also adds the journal quest to a day generated before this migration.
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
  today := (now() at time zone profile.timezone)::date;

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
    update public.quests q
      set done_at = now()
      from public.journal_entries j
      where q.user_id = uid and q.day = today and q.quest_key = 'journal.write'
        and j.user_id = uid and j.day = today
        and public.journal_line_count(j.body) >= lines;
  end if;

  return query
    select * from public.quests q where q.user_id = uid and q.day = today order by q.slot;
end;
$$;

-- Tick or untick one of your quests. Only today's (with 10 minutes' grace after midnight).
-- The journal quest is ticked by save_journal() instead.
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
  if quest_day not in (
    (now() at time zone tz)::date,
    ((now() - interval '10 minutes') at time zone tz)::date
  ) then
    raise exception 'Only today’s quests can be ticked';
  end if;
  update public.quests
    set done_at = case when done then coalesce(done_at, now()) end
    where id = quest;
end;
$$;

-- 4. Function privileges ----------------------------------------------------------

revoke execute on function public.save_journal(date, text) from public, anon;
revoke execute on function public.journal_lines_needed(integer) from public, anon, authenticated;
revoke execute on function public.journal_line_count(text) from public, anon, authenticated;

grant execute on function public.save_journal(date, text) to authenticated;
