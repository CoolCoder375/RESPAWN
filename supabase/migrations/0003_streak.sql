-- Milestone 3: streak = consecutive local days, ending today, with at least one
-- daily task completed. If today has no completion yet the streak still counts
-- through yesterday, so it only breaks once a whole day passes without one.
--
-- security invoker: RLS applies, so it works for yourself and your partner
-- and returns 0 for anyone else.

create function public.current_streak(target uuid, today date)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select distinct c.day
    from public.task_completions c
    join public.tasks t on t.id = c.task_id
    where c.user_id = target
      and t.kind = 'daily'
      and c.day <= today
  ),
  anchor as (
    select case when exists (select 1 from days where day = today) then today else today - 1 end as day
  ),
  ranked as (
    select day, row_number() over (order by day desc) as rn from days
  )
  -- Walking back from the anchor, row n matches only while it is exactly anchor - (n - 1).
  -- Days are distinct and descending, so after the first gap no later row can match again.
  select count(*)::integer
  from ranked, anchor
  where ranked.day = anchor.day - (ranked.rn - 1)::integer;
$$;

revoke execute on function public.current_streak(uuid, date) from public, anon;
grant execute on function public.current_streak(uuid, date) to authenticated;
