-- Quests: Respawn assigns each day's tasks; users only tick them (see QUESTS.md).
--
--   * questionnaires: the 20 answers, one row per user, written once by submit_questionnaire().
--   * quests: each local day's generated quests, written only by assign_quests().
--   * set_quest_done(): the only way to tick, and only for today's quests.
--   * Hand-made tasks are archived and become read-only history. run_length() scores a day
--     from its quests when it has any, otherwise from the old daily tasks, so the run carries over.

-- 1. Questionnaire --------------------------------------------------------------

create table public.questionnaires (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.questionnaires enable row level security;
revoke all on public.questionnaires from anon, authenticated;
grant select on public.questionnaires to authenticated;

-- Answers are private: not even the partner can read them.
create policy "questionnaires: read own"
  on public.questionnaires for select to authenticated
  using (user_id = (select auth.uid()));

-- Validates the answers against the question set in src/lib/questionnaire.ts and saves them.
-- Answering is once only; retaking comes with new seasons.
create function public.submit_questionnaire(answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  single constant jsonb := '{
    "wake": ["before6", "6-7", "7-8", "8-9", "after9"],
    "sleep": ["before10", "10-11", "11-12", "12-1", "after1"],
    "morning_feel": ["fresh", "ok", "tired", "exhausted"],
    "minutes": ["15", "30", "45", "60"],
    "exercise_time": ["morning", "afternoon", "evening", "varies"],
    "exercise_freq": ["never", "1-2", "3-4", "5plus"],
    "pushups": ["0", "knees", "5-15", "15plus"],
    "limits": ["none", "joints", "back", "other"],
    "water": ["lt4", "4-6", "7-9", "10plus"],
    "junk": ["daily", "weekly", "rarely"],
    "breakfast": ["never", "sometimes", "daily"],
    "screen": ["lt1", "1-3", "3-5", "5plus"],
    "phone_morning": ["always", "sometimes", "no"],
    "reading": ["never", "weekly", "daily"],
    "reflection": ["never", "sometimes", "daily"],
    "planning": ["never", "sometimes", "daily"],
    "breaker": ["comfort", "phone", "late", "stress", "mood", "noplan"],
    "intensity": ["gentle", "steady", "hard"]
  }';
  multi constant jsonb := '{
    "enjoy": {"max": 6, "options": ["walking", "running", "gym", "yoga", "home", "sport"]},
    "goals": {"max": 2, "options": ["fitness", "sleep", "focus", "calm", "food", "phone", "discipline"]}
  }';
  key text;
  spec jsonb;
  value jsonb;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Set up your profile first';
  end if;
  if exists (select 1 from public.questionnaires where user_id = uid) then
    raise exception 'You have already answered the questionnaire';
  end if;
  if jsonb_typeof(answers) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(answers)) <> 20 then
    raise exception 'Answer all 20 questions';
  end if;

  for key, spec in select * from jsonb_each(single) loop
    value := answers -> key;
    if jsonb_typeof(value) is distinct from 'string' or not spec ? (value #>> '{}') then
      raise exception 'Invalid answer for %', key;
    end if;
  end loop;

  for key, spec in select * from jsonb_each(multi) loop
    value := answers -> key;
    if jsonb_typeof(value) is distinct from 'array'
      or jsonb_array_length(value) not between 1 and (spec ->> 'max')::integer
      or exists (
        select 1 from jsonb_array_elements(value) e
        where jsonb_typeof(e) <> 'string' or not (spec -> 'options') ? (e #>> '{}')
      )
      or (select count(distinct e) from jsonb_array_elements_text(value) e) <> jsonb_array_length(value)
    then
      raise exception 'Invalid answer for %', key;
    end if;
  end loop;

  insert into public.questionnaires (user_id, answers) values (uid, answers);
end;
$$;

-- 2. Quests ---------------------------------------------------------------------

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  slot smallint not null,
  quest_key text not null,
  title text not null,
  detail text,
  category text not null,
  rp smallint not null check (rp between 1 and 3),
  tier smallint not null check (tier between 1 and 4),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, day, slot),
  unique (user_id, day, quest_key)
);

alter table public.quests enable row level security;
revoke all on public.quests from anon, authenticated;
grant select on public.quests to authenticated;

create policy "quests: read own and partner"
  on public.quests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_partner(user_id));

alter publication supabase_realtime add table public.quests;

-- 12-hour clock from minutes after midnight (wraps), e.g. 1410 -> '11:30 pm'.
create function public.quest_clock(minutes integer)
returns text
language sql
immutable
set search_path = ''
as $$
  with m as (select ((minutes % 1440) + 1440) % 1440 as v)
  select ((v / 60 + 11) % 12 + 1)::text || ':' || lpad((v % 60)::text, 2, '0')
    || case when v < 720 then ' am' else ' pm' end
  from m;
$$;

-- One candidate quest. Score = how much the answers say you need it, +2 if it targets
-- what breaks your routine, +3 if it serves one of your goals (which also makes it 3 RP).
create function public.quest_candidate(
  key text, area text, title text, detail text, category text, need integer,
  serves text[], fixes text[], goals text[], breaker text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'key', key, 'area', area, 'title', title, 'detail', detail, 'category', category,
    'need', need,
    'score', need
      + case when breaker = any (fixes) then 2 else 0 end
      + case when goals && serves then 3 else 0 end,
    'rp', case when goals && serves then 3 else 2 end
  );
$$;

-- The rules engine: answers + tier (1 Foundation .. 4 Master) + day -> that day's quests.
-- Pure and deterministic, so the same inputs always give the same quests.
create function public.build_quests(a jsonb, tier integer, day date)
returns table (slot smallint, quest_key text, title text, detail text, category text, rp smallint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  t integer := least(greatest(tier, 1), 4);
  dow integer := extract(isodow from day);
  -- Weeks since a Monday, to rotate Saturday's favourite.
  week integer := (day - date '2024-01-01') / 7;
  goals text[] := array(select jsonb_array_elements_text(a -> 'goals'));
  enjoy text[] := array(select jsonb_array_elements_text(a -> 'enjoy'));
  breaker text := a ->> 'breaker';
  no_impact boolean := a ->> 'limits' in ('joints', 'other');
  move_tier integer := least(
    t, case a ->> 'exercise_freq' when 'never' then 2 when '1-2' then 3 else 4 end
  );
  how_many integer := case a ->> 'minutes'
    when '15' then 4 when '30' then 5 when '45' then 6 else 7 end;
  -- Minutes after midnight.
  wake integer := case a ->> 'wake'
    when 'before6' then 330 when '6-7' then 390 when '7-8' then 450 when '8-9' then 510
    else 570 end;
  -- Minutes after noon, so times past midnight still compare correctly.
  bed integer := case a ->> 'sleep'
    when 'before10' then 600 when '10-11' then 660 when '11-12' then 720 when '12-1' then 780
    else 810 end;
  bed_target integer;
  pushup_word text := case a ->> 'pushups'
    when '0' then 'wall push-ups' when 'knees' then 'knee push-ups' else 'push-ups' end;
  pushup_count integer := case a ->> 'pushups'
    when '15plus' then (array[10, 12, 15, 20])[move_tier]
    else (array[5, 6, 8, 10])[move_tier] end;
  screen_limit text := case a ->> 'screen'
    when '5plus' then (array['4h', '3.5h', '3h', '2.5h'])[t]
    when '3-5' then (array['3h', '2.5h', '2h', '1.5h'])[t]
    else (array['2h', '1.5h', '1.5h', '1h'])[t] end;
  kind text;
  day_label text;
  move_key text;
  move_title text;
  move_rp integer := 3;
  when_label text := case a ->> 'exercise_time'
    when 'morning' then 'best in the morning' when 'afternoon' then 'best in the afternoon'
    when 'evening' then 'best in the evening' end;
  cands jsonb := '[]';
begin
  -- Movement: the main quest, by weekday.
  kind := case dow
    when 1 then 'strength' when 4 then 'strength'
    when 2 then 'cardio' when 5 then 'cardio'
    when 3 then 'yoga'
    when 6 then enjoy[week % cardinality(enjoy) + 1]
    else 'rest' end;
  day_label := case dow
    when 1 then 'Strength day' when 4 then 'Strength day'
    when 2 then 'Cardio day' when 5 then 'Cardio day'
    when 3 then 'Mobility day' when 6 then 'Your pick' else 'Rest day' end;

  kind := case
    when kind = 'strength' and a ->> 'exercise_freq' = 'never' and t = 1 then 'walking'
    when kind = 'strength' then case when 'gym' = any (enjoy) then 'gym' else 'home' end
    when kind = 'cardio' then case
      when 'running' = any (enjoy) and not no_impact then 'running'
      when 'sport' = any (enjoy) then 'sport'
      else 'walking' end
    when kind = 'running' and no_impact then 'walking'
    else kind end;
  if dow in (1, 4) and kind = 'walking' then
    day_label := 'Easy start';
  end if;

  case kind
    when 'walking' then
      move_key := 'move.walk';
      move_title := format('Brisk walk, %s min', (array[15, 20, 30, 40])[move_tier]);
    when 'running' then
      move_key := 'move.run';
      move_title := format('Run, %s min', (array[10, 15, 20, 25])[move_tier]);
    when 'gym' then
      move_key := 'move.gym';
      move_title := format('Gym session, %s min', (array[30, 40, 45, 60])[move_tier]);
    when 'home' then
      move_key := 'move.home';
      move_title := format(
        'Home strength: %s rounds of 10 squats, %s %s, 20 s plank',
        (array[2, 3, 4, 5])[move_tier], pushup_count, pushup_word
      );
    when 'yoga' then
      move_key := 'move.yoga';
      move_title := format('Yoga, %s min', (array[10, 15, 20, 30])[move_tier]);
    when 'sport' then
      move_key := 'move.sport';
      move_title := format('Play your sport, %s min', (array[30, 45, 60, 60])[move_tier]);
    else
      move_key := 'move.rest';
      move_title := 'Active rest: 20 min stretch or easy walk';
      move_rp := 2;
  end case;

  cands := cands || jsonb_build_object(
    'key', move_key, 'area', 'move_main', 'title', move_title,
    'detail', concat_ws(' · ', day_label, when_label), 'category', 'body',
    'score', 0, 'rp', move_rp
  );

  -- Sleep. Lights out moves 15 min earlier per tier, never earlier than 8 h before waking,
  -- and never later than you already sleep.
  bed_target := least(bed, greatest(bed - 15 * (t - 1), wake + 240));
  cands := cands
    || public.quest_candidate(
      'sleep.lights_out', 'sleep', 'Lights out by ' || public.quest_clock(bed_target + 720),
      'Phone away, lights off', 'recovery',
      case when a ->> 'sleep' in ('12-1', 'after1') then 3
           when a ->> 'sleep' = '11-12' or a ->> 'morning_feel' in ('tired', 'exhausted') then 2
           else 1 end,
      array['sleep'], array['late'], goals, breaker)
    || public.quest_candidate(
      'sleep.up', 'sleep', 'Up by ' || public.quest_clock(greatest(wake - 15 * (t - 1), 330)),
      'No snooze', 'recovery',
      case when a ->> 'wake' in ('8-9', 'after9') then 3 else 1 end,
      array['sleep', 'discipline'], array['comfort'], goals, breaker)
    || public.quest_candidate(
      'sleep.no_screens', 'sleep',
      format('No screens %s min before bed', (array[15, 30, 45, 60])[t]),
      null, 'recovery',
      case a ->> 'screen' when '5plus' then 3 when '3-5' then 2 else 1 end,
      array['sleep', 'phone'], array['phone', 'late'], goals, breaker);

  -- Mind.
  cands := cands
    || public.quest_candidate(
      'mind.phone_morning', 'mind',
      format('No phone for the first %s min after waking', (array[15, 30, 45, 60])[t]),
      null, 'focus',
      case a ->> 'phone_morning' when 'always' then 3 when 'sometimes' then 2 else 0 end,
      array['phone', 'focus', 'discipline'], array['phone'], goals, breaker)
    || public.quest_candidate(
      'mind.screen', 'mind', format('Phone screen time under %s', screen_limit),
      'Outside work. Check it in your phone settings.', 'focus',
      case a ->> 'screen' when '5plus' then 3 when '3-5' then 2 when '1-3' then 1 else 0 end,
      array['phone', 'focus'], array['phone'], goals, breaker)
    || public.quest_candidate(
      'mind.read', 'mind', format('Read %s pages', (array[5, 10, 15, 20])[t]),
      'A book, not a feed', 'focus',
      case a ->> 'reading' when 'never' then 2 else 1 end,
      array['focus'], array[]::text[], goals, breaker)
    || public.quest_candidate(
      'mind.sit', 'mind', format('Sit quietly for %s min', (array[5, 10, 15, 20])[t]),
      'Meditation, prayer or jap', 'mind',
      case a ->> 'reflection' when 'never' then 2 else 1 end,
      array['calm'], array['mood', 'stress'], goals, breaker)
    || public.quest_candidate(
      'mind.plan', 'mind', 'Plan tomorrow in 3 lines',
      'Top task, workout time, bedtime', 'focus',
      case a ->> 'planning' when 'never' then 2 when 'sometimes' then 1 else 0 end,
      array['focus', 'discipline'], array['noplan', 'comfort'], goals, breaker)
    || public.quest_candidate(
      'mind.journal', 'mind',
      format('Journal %s', (array['1 line', '2 lines', '3 lines', '5 lines'])[t]),
      'How did today go?', 'mind', 1,
      array['calm'], array['mood'], goals, breaker);

  -- Food and body care.
  cands := cands
    || public.quest_candidate(
      'food.water', 'food', format('Drink %s glasses of water', (array[6, 7, 8, 8])[t]),
      null, 'body',
      case a ->> 'water' when 'lt4' then 3 when '4-6' then 2 when '7-9' then 1 else 0 end,
      array['food', 'fitness'], array[]::text[], goals, breaker)
    || public.quest_candidate(
      'food.no_junk', 'food', 'No junk food or sugary snacks', null, 'body',
      case a ->> 'junk' when 'daily' then 3 when 'weekly' then 2 else 0 end,
      array['food'], array['comfort', 'stress'], goals, breaker)
    || public.quest_candidate(
      'food.breakfast', 'food', 'Eat a proper breakfast', null, 'body',
      case a ->> 'breakfast' when 'never' then 2 when 'sometimes' then 1 else 0 end,
      array['food'], array[]::text[], goals, breaker)
    || public.quest_candidate(
      'food.veg', 'food', 'A fruit or vegetable with every meal', null, 'body', 1,
      array['food'], array[]::text[], goals, breaker)
    || public.quest_candidate(
      'move.stretch', 'move', format('Stretch for %s min', (array[5, 10, 10, 15])[t]),
      null, 'body', case when a ->> 'limits' = 'back' then 2 else 1 end,
      array['fitness', 'calm'], array[]::text[], goals, breaker)
    || public.quest_candidate(
      'move.walk_meal', 'move', '10 min walk after a meal', null, 'body', 1,
      array['fitness', 'food'], array[]::text[], goals, breaker);

  cands := cands || jsonb_build_object(
    'key', 'verse.read', 'area', 'verse', 'title', 'Read today’s verse and reflection',
    'detail', 'On the Thought tab', 'category', 'mind', 'score', 0, 'rp', 1
  );

  -- Movement, the best sleep quest, the best mind quest, the top extras, then the verse.
  return query
  with cand as (
    select q ->> 'key' as k, q ->> 'area' as area, q ->> 'title' as ti, q ->> 'detail' as de,
      q ->> 'category' as ca, coalesce((q ->> 'need')::integer, 0) as need,
      (q ->> 'score')::integer as sc, (q ->> 'rp')::integer as points, ord
    from jsonb_array_elements(cands) with ordinality as e (q, ord)
  ),
  -- The sleep slot goes to your biggest sleep problem, whatever your goals.
  best_sleep as (
    select k from cand where area = 'sleep' order by need desc, ord limit 1
  ),
  best_mind as (
    select k from cand where area = 'mind' order by sc desc, ord limit 1
  ),
  -- Extras: the best of each area first, so one area can't take every slot.
  -- Quests you don't need at all (score 0) come last.
  ranked as (
    select k, sc, ord, row_number() over (partition by area order by sc desc, ord) as area_rank
    from cand
    where area in ('sleep', 'mind', 'food', 'move')
      and k not in (select k from best_sleep union all select k from best_mind)
  ),
  extras as (
    select k, row_number() over (order by sc = 0, area_rank, sc desc, ord) as n
    from ranked
    order by sc = 0, area_rank, sc desc, ord
    limit greatest(how_many - 4, 0)
  ),
  chosen as (
    select k, 1 as grp, 0::bigint as n from cand where area = 'move_main'
    union all select k, 2, 0 from best_sleep
    union all select k, 3, 0 from best_mind
    union all select k, 4, extras.n from extras
    union all select k, 5, 0 from cand where area = 'verse'
  )
  select (row_number() over (order by chosen.grp, chosen.n))::smallint,
    cand.k, cand.ti, cand.de, cand.ca, cand.points::smallint
  from chosen join cand using (k)
  order by chosen.grp, chosen.n;
end;
$$;

-- Returns today's quests for the caller, generating them on the first call of the local day.
-- "Today" comes from profiles.timezone on the server, so the client can't pick the day.
create function public.assign_quests()
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
    select uid, today, b.slot, b.quest_key, b.title, b.detail, b.category, b.rp, tier
    from public.build_quests(answers, tier, today) b;
  end if;

  return query
    select * from public.quests q where q.user_id = uid and q.day = today order by q.slot;
end;
$$;

-- Tick or untick one of your quests. Only today's (with 10 minutes' grace after midnight).
create function public.set_quest_done(quest uuid, done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  quest_day date;
  tz text;
begin
  select q.day, p.timezone into quest_day, tz
  from public.quests q join public.profiles p on p.id = q.user_id
  where q.id = quest and q.user_id = uid;
  if not found then
    raise exception 'Quest not found';
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

-- 3. Lock the old hand-made tasks ------------------------------------------------

update public.tasks set archived = true where not archived;

revoke insert, update on public.tasks from authenticated;
revoke insert, delete on public.task_completions from authenticated;

-- 4. The run: quests where a day has them, the old daily tasks otherwise ---------

create or replace function public.run_length(target uuid, through date)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with profile as (
    select timezone from public.profiles where id = target
  ),
  daily as (
    select
      t.id,
      t.priority,
      (t.created_at at time zone p.timezone)::date as first_day,
      (t.archived_at at time zone p.timezone)::date as gone_day
    from public.tasks t, profile p
    where t.user_id = target and t.kind = 'daily'
  ),
  quest_days as (
    select
      q.day,
      sum(q.rp) as possible,
      coalesce(sum(q.rp) filter (where q.done_at is not null), 0) as earned
    from public.quests q
    where q.user_id = target and q.day <= through
    group by q.day
  ),
  days as (
    select d::date as day
    from generate_series(
      greatest(
        least((select min(first_day) from daily), (select min(day) from quest_days)),
        through - 400
      ),
      through,
      interval '1 day'
    ) d
  ),
  task_scored as (
    select
      days.day,
      coalesce(sum(daily.priority), 0) as possible,
      coalesce(sum(daily.priority) filter (
        where exists (
          select 1 from public.task_completions c
          where c.task_id = daily.id and c.day = days.day
        )
      ), 0) as earned
    from days
    left join daily
      on daily.first_day <= days.day
      and (daily.gone_day is null or daily.gone_day > days.day)
    group by days.day
  ),
  scored as (
    select
      ts.day,
      coalesce(qd.possible, ts.possible) as possible,
      coalesce(qd.earned, ts.earned) as earned
    from task_scored ts
    left join quest_days qd on qd.day = ts.day
  ),
  last_miss as (
    select max(day) as day from scored where possible = 0 or earned * 2 < possible
  )
  select coalesce(
    through - coalesce((select day from last_miss), (select min(day) from days) - 1),
    0
  )::integer;
$$;

-- 5. Function privileges ----------------------------------------------------------

revoke execute on function public.submit_questionnaire(jsonb) from public, anon;
revoke execute on function public.assign_quests() from public, anon;
revoke execute on function public.set_quest_done(uuid, boolean) from public, anon;
revoke execute on function public.build_quests(jsonb, integer, date) from public, anon, authenticated;
revoke execute on function public.quest_candidate(text, text, text, text, text, integer, text[], text[], text[], text) from public, anon, authenticated;
revoke execute on function public.quest_clock(integer) from public, anon, authenticated;

grant execute on function public.submit_questionnaire(jsonb) to authenticated;
grant execute on function public.assign_quests() to authenticated;
grant execute on function public.set_quest_done(uuid, boolean) to authenticated;
