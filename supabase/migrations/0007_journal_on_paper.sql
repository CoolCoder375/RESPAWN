-- Journal on paper: "I wrote it in my notebook" completes the journal quest without typing it out.
--
--   * journal_entries.on_paper: set by set_journal_on_paper(). An entry can be on paper with no text.
--   * The journal quest is done when the entry is on paper or has enough lines.
--   * sync_journal_quest() recomputes that after either function writes.

-- 1. Entries --------------------------------------------------------------------

alter table public.journal_entries
  add column on_paper boolean not null default false;

alter table public.journal_entries
  drop constraint journal_entries_body_check,
  add constraint journal_entries_body_check
    check (char_length(body) <= 4000 and (on_paper or char_length(body) >= 1));

-- 2. Ticking the quest ------------------------------------------------------------

-- Tick or untick the journal quest for one of your days from its entry.
create function public.sync_journal_quest(uid uuid, day date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.quests q
    set done_at = case
      when exists (
        select 1 from public.journal_entries j
        where j.user_id = uid and j.day = sync_journal_quest.day
          and (j.on_paper or public.journal_line_count(j.body) >= public.journal_lines_needed(q.tier))
      ) then coalesce(q.done_at, now())
    end
    where q.user_id = uid and q.day = sync_journal_quest.day
      and q.quest_key in ('journal.write', 'mind.journal');
$$;

-- Raises unless `day` is the caller's today (10 minutes' grace after midnight).
create function public.assert_journal_day(uid uuid, day date)
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
  if day not in (
    (now() at time zone tz)::date,
    ((now() - interval '10 minutes') at time zone tz)::date
  ) then
    raise exception 'Only today’s journal can be written';
  end if;
end;
$$;

-- 3. Writing --------------------------------------------------------------------

-- Same as 0006, except a blank body keeps an entry that is on paper.
create or replace function public.save_journal(day date, body text)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  clean text := btrim(save_journal.body, E' \t\r\n');
  entry public.journal_entries;
begin
  perform public.assert_journal_day(uid, save_journal.day);

  if clean = '' then
    delete from public.journal_entries j
      where j.user_id = uid and j.day = save_journal.day and not j.on_paper;
    update public.journal_entries j set body = '', updated_at = now()
      where j.user_id = uid and j.day = save_journal.day
      returning * into entry;
  else
    insert into public.journal_entries as j (user_id, day, body)
    values (uid, save_journal.day, clean)
    on conflict (user_id, day) do update set body = excluded.body, updated_at = now()
    returning * into entry;
  end if;

  perform public.sync_journal_quest(uid, save_journal.day);
  return entry;
end;
$$;

-- Mark today's journal as written in a notebook, or undo that.
create function public.set_journal_on_paper(day date, on_paper boolean)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  entry public.journal_entries;
begin
  perform public.assert_journal_day(uid, set_journal_on_paper.day);

  if set_journal_on_paper.on_paper then
    insert into public.journal_entries as j (user_id, day, body, on_paper)
    values (uid, set_journal_on_paper.day, '', true)
    on conflict (user_id, day) do update set on_paper = true, updated_at = now()
    returning * into entry;
  else
    delete from public.journal_entries j
      where j.user_id = uid and j.day = set_journal_on_paper.day and j.body = '';
    update public.journal_entries j set on_paper = false, updated_at = now()
      where j.user_id = uid and j.day = set_journal_on_paper.day
      returning * into entry;
  end if;

  perform public.sync_journal_quest(uid, set_journal_on_paper.day);
  return entry;
end;
$$;

-- 4. Function privileges ----------------------------------------------------------

revoke execute on function public.sync_journal_quest(uuid, date) from public, anon, authenticated;
revoke execute on function public.assert_journal_day(uuid, date) from public, anon, authenticated;
revoke execute on function public.set_journal_on_paper(date, boolean) from public, anon;

grant execute on function public.set_journal_on_paper(date, boolean) to authenticated;
