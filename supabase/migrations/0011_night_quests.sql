-- Night quests you can actually do at night.
--
-- "Lights out by 1:00 am" and "No screens before bed" had to be ticked at bedtime, right after
-- putting the phone away. They become check-ins on the night before, ticked in the morning:
-- "Slept by 1:00 am last night". The evening gets quests you can tick as soon as they're done:
-- slow breathing and talking to a friend or family (new), stretch before bed and a walk after
-- dinner (reworded), next to planning tomorrow and the journal.
--
-- mind.journal is no longer a candidate: assign_quests (0006) always dropped it and adds the
-- journal quest itself, so when it ranked first in the mind area the day lost a quest.
--
-- Quests already generated keep their titles; the new ones start with the next day's quests.


-- The rules engine: answers + tier (1 Foundation .. 4 Master) + day -> that day's quests.
-- Pure and deterministic, so the same inputs always give the same quests.
create or replace function public.build_quests(a jsonb, tier integer, day date)
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
      'sleep.lights_out', 'sleep', 'Slept by ' || public.quest_clock(bed_target + 720) || ' last night',
      'Phone away, lights off. Tick it when you wake up.', 'recovery',
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
      format('No screens %s min before bed last night', (array[15, 30, 45, 60])[t]),
      'Tick it when you wake up', 'recovery',
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
      'mind.breathe', 'mind', format('Slow breathing for %s min', (array[3, 5, 5, 10])[t]),
      'Before bed: breathe in for 4, out for 6', 'mind',
      case when breaker in ('stress', 'mood') then 2 else 1 end,
      array['calm', 'sleep'], array['stress', 'mood'], goals, breaker)
    || public.quest_candidate(
      'mind.connect', 'mind', 'Talk to a friend or someone in your family',
      'A call or a real conversation, not just texts', 'mind',
      case when breaker = 'mood' or a ->> 'reflection' = 'never' then 2 else 1 end,
      array['calm'], array['mood', 'stress'], goals, breaker);

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
      'move.stretch', 'move', format('Stretch before bed, %s min', (array[5, 10, 10, 15])[t]),
      null, 'body', case when a ->> 'limits' = 'back' then 2 else 1 end,
      array['fitness', 'calm'], array[]::text[], goals, breaker)
    || public.quest_candidate(
      'move.walk_meal', 'move', '10 min walk after dinner', null, 'body', 1,
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
