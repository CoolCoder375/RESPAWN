-- Respawn Points (RP) and the reset rule.
--
-- Every task has a priority worth RP: 1 = Low, 2 = Medium (default), 3 = High.
-- A local day "counts" when the daily tasks ticked that day are worth at least half
-- the RP of all daily tasks that existed that day. The run (Day X of 60) is the number
-- of consecutive counting days; one day that doesn't count sends you back to Day 1.
--
-- Replaces current_streak() from 0003.

alter table public.tasks
  add column priority smallint not null default 2 check (priority between 1 and 3),
  -- When the task was archived, so past days are judged against the tasks that existed then.
  add column archived_at timestamptz;

update public.tasks set archived_at = now() where archived;

grant insert (priority) on public.tasks to authenticated;
grant update (priority) on public.tasks to authenticated;

-- archived_at follows `archived`; users can't write it directly (no column grant).
create function public.sync_archived_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived and (tg_op = 'INSERT' or not old.archived) then
    new.archived_at := now();
  elsif not new.archived then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_sync_archived_at
  before insert or update of archived on public.tasks
  for each row execute function public.sync_archived_at();

revoke execute on function public.sync_archived_at() from public, anon, authenticated;

drop function public.current_streak(uuid, date);

-- run_length(target, through): consecutive counting days ending exactly on `through`
-- (0 if `through` itself doesn't count). The app calls it with yesterday and adds
-- today's live result itself, so ticking updates the streak instantly.
--
-- security invoker: RLS applies, so it works for yourself and your partner, 0 for anyone else.
-- Looks back at most 400 days.
create function public.run_length(target uuid, through date)
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
      -- Archived on day D: no longer counted from D onwards.
      (t.archived_at at time zone p.timezone)::date as gone_day
    from public.tasks t, profile p
    where t.user_id = target and t.kind = 'daily'
  ),
  days as (
    select d::date as day
    from generate_series(
      greatest((select min(first_day) from daily), through - 400),
      through,
      interval '1 day'
    ) d
  ),
  scored as (
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
  last_miss as (
    select max(day) as day from scored where possible = 0 or earned * 2 < possible
  )
  -- With no miss in range, the run covers every scored day.
  select coalesce(
    through - coalesce((select day from last_miss), (select min(day) from days) - 1),
    0
  )::integer;
$$;

revoke execute on function public.run_length(uuid, date) from public, anon;
grant execute on function public.run_length(uuid, date) to authenticated;
