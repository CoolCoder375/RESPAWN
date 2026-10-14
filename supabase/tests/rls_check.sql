-- Row Level Security check against the linked project.
--
--   npx supabase db query --linked -f supabase/tests/rls_check.sql
--
-- Creates three throwaway users (A = owner, B = partner-to-be, C = stranger), impersonates
-- each one the way PostgREST does, and checks what they can see and change.
-- The script ALWAYS ends by raising an exception, which rolls back every change it made.
-- The final error message is the report: "RLS CHECK PASSED (n checks)" or the list of failures.

begin;

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.act_as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true);
  select set_config('request.jwt.claims', '', true);
$$;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  task_a uuid;
  high_c uuid;
  low_c uuid;
  quest_c uuid;
  answers jsonb := '{"wake":"7-8","sleep":"12-1","morning_feel":"tired","minutes":"30","exercise_time":"morning","exercise_freq":"1-2","enjoy":["walking","yoga"],"pushups":"knees","limits":"none","water":"4-6","junk":"weekly","breakfast":"sometimes","screen":"3-5","phone_morning":"always","reading":"never","reflection":"sometimes","planning":"never","goals":["fitness","phone"],"breaker":"phone","intensity":"steady"}';
  today date := (now() at time zone 'utc')::date;
  invite_code text;
  n integer;
  passed integer := 0;
  failures text[] := '{}';

begin
  -- Setup (as postgres) ------------------------------------------------------
  insert into auth.users (id, email, aud, role)
  values (a, a || '@rls.test', 'authenticated', 'authenticated'),
         (b, b || '@rls.test', 'authenticated', 'authenticated'),
         (c, c || '@rls.test', 'authenticated', 'authenticated');
  insert into public.profiles (id, display_name, timezone)
  values (a, 'A', 'UTC'), (b, 'B', 'Asia/Kolkata'), (c, 'C', 'UTC');
  insert into public.tasks (user_id, title, kind) values (a, 'A task', 'daily') returning id into task_a;
  insert into public.task_completions (task_id, user_id, day) values (task_a, a, today);
  insert into public.coach_messages (user_id, role, content) values (a, 'user', 'private chat');

  -- 1. Before pairing, B sees nothing of A's ---------------------------------
  perform pg_temp.act_as(b);
  select count(*) into n from public.tasks where user_id = a;
  if n = 0 then passed := passed + 1; else failures := failures || 'unpaired B can read A tasks'; end if;
  select count(*) into n from public.task_completions where user_id = a;
  if n = 0 then passed := passed + 1; else failures := failures || 'unpaired B can read A completions'; end if;
  select count(*) into n from public.profiles where id = a;
  if n = 0 then passed := passed + 1; else failures := failures || 'unpaired B can read A profile'; end if;

  -- B can't create a task owned by A (user_id isn't writable at all).
  begin
    insert into public.tasks (user_id, title, kind) values (a, 'spoof', 'daily');
    failures := failures || 'B inserted a task as A';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- B can't attach itself to a pair by writing pair_id.
  begin
    update public.profiles set pair_id = gen_random_uuid() where id = b;
    failures := failures || 'B wrote profiles.pair_id';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- 2. Pairing through invite ------------------------------------------------
  perform pg_temp.act_as(a);
  select code into invite_code from public.create_invite();
  if invite_code ~ '^[A-Z2-9]{6}$' then passed := passed + 1; else failures := failures || 'bad invite code format'; end if;

  begin
    perform public.redeem_invite(invite_code);
    failures := failures || 'A redeemed own invite';
  exception when raise_exception then passed := passed + 1;
  end;

  perform pg_temp.act_as(c);
  select count(*) into n from public.pair_invites where code = invite_code;
  if n = 0 then passed := passed + 1; else failures := failures || 'C can read A invite'; end if;

  perform pg_temp.act_as(b);
  perform public.redeem_invite(lower(invite_code));  -- codes are case-insensitive
  select count(*) into n from public.profiles where pair_id is not null and id in (a, b);
  if n = 2 then passed := passed + 1; else failures := failures || 'redeem did not pair both profiles'; end if;

  perform pg_temp.act_as(c);
  begin
    perform public.redeem_invite(invite_code);
    failures := failures || 'used invite redeemed twice';
  exception when raise_exception then passed := passed + 1;
  end;

  -- 3. After pairing, B can read A's data but not change it -------------------
  perform pg_temp.act_as(b);
  select count(*) into n from public.tasks where user_id = a;
  if n = 1 then passed := passed + 1; else failures := failures || 'paired B cannot read A tasks'; end if;
  select count(*) into n from public.task_completions where user_id = a;
  if n = 1 then passed := passed + 1; else failures := failures || 'paired B cannot read A completions'; end if;
  select count(*) into n from public.profiles where id = a;
  if n = 1 then passed := passed + 1; else failures := failures || 'paired B cannot read A profile'; end if;

  begin
    update public.tasks set title = 'hacked' where id = task_a;
    failures := failures || 'B edited A task';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  begin
    delete from public.task_completions where task_id = task_a;
    failures := failures || 'B unticked A task';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  begin
    insert into public.task_completions (task_id, day) values (task_a, today + 1);
    failures := failures || 'B ticked A task';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  select count(*) into n from public.coach_messages where user_id = a;
  if n = 0 then passed := passed + 1; else failures := failures || 'B can read A coach chat'; end if;

  -- Stranger C still sees nothing.
  perform pg_temp.act_as(c);
  select count(*) into n from public.tasks where user_id = a;
  if n = 0 then passed := passed + 1; else failures := failures || 'stranger C can read A tasks'; end if;

  -- Run: partner sees A's (1, all RP ticked today), stranger gets 0.
  perform pg_temp.act_as(b);
  if public.run_length(a, today) = 1 then passed := passed + 1; else failures := failures || 'partner B cannot see A run'; end if;
  perform pg_temp.act_as(c);
  if public.run_length(a, today) = 0 then passed := passed + 1; else failures := failures || 'stranger C sees A run'; end if;

  -- 4. Old hand-made tasks are read-only history, even for their owner (0005) -----
  perform pg_temp.act_as(a);
  begin
    insert into public.tasks (title, kind) values ('My own task', 'daily');
    failures := failures || 'A created a task';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    update public.tasks set title = 'easier' where id = task_a;
    failures := failures || 'A edited a task';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    insert into public.task_completions (task_id, day) values (task_a, today);
    failures := failures || 'A ticked an old task';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    delete from public.task_completions where task_id = task_a;
    failures := failures || 'A unticked an old task';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  select count(*) into n from public.tasks where id = task_a;
  if n = 1 then passed := passed + 1; else failures := failures || 'A cannot read own tasks'; end if;

  -- 5. Cheers: partner only, max 5 per day ------------------------------------
  perform pg_temp.act_as(b);
  begin
    insert into public.cheers (to_user, message) values (c, 'Keep going');
    failures := failures || 'B cheered a non-partner';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  for i in 1..5 loop
    insert into public.cheers (to_user, message) values (a, 'Keep going');
  end loop;
  begin
    insert into public.cheers (to_user, message) values (a, 'Proud of you');
    failures := failures || '6th cheer allowed';
  exception when raise_exception then passed := passed + 1;
  end;

  perform pg_temp.act_as(a);
  update public.cheers set seen_at = now() where to_user = a;
  get diagnostics n = row_count;
  if n = 5 then passed := passed + 1; else failures := failures || 'receiver cannot mark cheers seen'; end if;

  perform pg_temp.act_as(b);
  update public.cheers set seen_at = null where from_user = b;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failures := failures || 'sender changed seen_at'; end if;

  -- 6. Unpair cuts access, keeps data -----------------------------------------
  perform pg_temp.act_as(a);
  perform public.unpair();
  perform pg_temp.act_as(b);
  select count(*) into n from public.tasks where user_id = a;
  if n = 0 then passed := passed + 1; else failures := failures || 'B still reads A tasks after unpair'; end if;
  perform pg_temp.act_as(a);
  select count(*) into n from public.tasks where id = task_a;
  if n = 1 then passed := passed + 1; else failures := failures || 'A lost tasks after unpair'; end if;

  -- 8. Respawn Points and the 50% rule --------------------------------------------
  -- C (UTC) has two daily tasks from 10 days ago: High (3 RP) and Low (1 RP) -> 4 possible, need 2.
  perform pg_temp.act_as_admin();
  insert into public.tasks (user_id, title, kind, priority, created_at)
    values (c, 'Gym', 'daily', 3, now() - interval '10 days') returning id into high_c;
  insert into public.tasks (user_id, title, kind, priority, created_at)
    values (c, 'Walk out', 'daily', 1, now() - interval '10 days') returning id into low_c;
  -- 3 days ago: High (3/4, counts). 2 days ago: Low only (1/4, miss). Yesterday: High (counts).
  insert into public.task_completions (task_id, user_id, day)
    values (high_c, c, today - 3), (low_c, c, today - 2), (high_c, c, today - 1);

  perform pg_temp.act_as(c);
  n := public.run_length(c, today - 1);
  if n = 1 then passed := passed + 1; else failures := failures || format('run after a miss: expected 1, got %s', n); end if;
  n := public.run_length(c, today - 3);
  if n = 1 then passed := passed + 1; else failures := failures || format('run on a counting day: expected 1, got %s', n); end if;

  perform pg_temp.act_as_admin();
  insert into public.task_completions (task_id, user_id, day) values (low_c, c, today);
  perform pg_temp.act_as(c);
  n := public.run_length(c, today);
  if n = 0 then passed := passed + 1; else failures := failures || format('Low only (1/4) should not count, got %s', n); end if;
  perform pg_temp.act_as_admin();
  insert into public.task_completions (task_id, user_id, day) values (high_c, c, today);
  perform pg_temp.act_as(c);
  n := public.run_length(c, today);
  if n = 2 then passed := passed + 1; else failures := failures || format('run with today: expected 2, got %s', n); end if;

  -- A task added today doesn't change yesterday's verdict.
  perform pg_temp.act_as_admin();
  insert into public.tasks (user_id, title, kind, priority) values (c, 'New high', 'daily', 3);
  perform pg_temp.act_as(c);
  n := public.run_length(c, today - 1);
  if n = 1 then passed := passed + 1; else failures := failures || format('new task rewrote history: got %s', n); end if;

  -- Archiving sets archived_at and only affects days from now on.
  perform pg_temp.act_as_admin();
  update public.tasks set archived = true where id = low_c;
  perform pg_temp.act_as(c);
  select count(*) into n from public.tasks where id = low_c and archived_at is not null;
  if n = 1 then passed := passed + 1; else failures := failures || 'archived_at not set'; end if;
  n := public.run_length(c, today - 1);
  if n = 1 then passed := passed + 1; else failures := failures || format('archive rewrote history: got %s', n); end if;

  perform pg_temp.act_as_admin();
  begin
    insert into public.tasks (user_id, title, kind, priority) values (c, 'Too important', 'daily', 5);
    failures := failures || 'priority 5 accepted';
  exception when check_violation then passed := passed + 1;
  end;

  -- 9. Questionnaire and quests (0005) ---------------------------------------------
  perform pg_temp.act_as(c);
  begin
    perform public.assign_quests();
    failures := failures || 'quests assigned without a questionnaire';
  exception when raise_exception then passed := passed + 1;
  end;
  begin
    perform public.submit_questionnaire(answers - 'goals');
    failures := failures || 'questionnaire with 19 answers accepted';
  exception when raise_exception then passed := passed + 1;
  end;
  begin
    perform public.submit_questionnaire(jsonb_set(answers, '{goals}', '["fitness", "sleep", "focus"]'));
    failures := failures || 'three goals accepted';
  exception when raise_exception then passed := passed + 1;
  end;
  begin
    perform public.submit_questionnaire(jsonb_set(answers, '{wake}', '"noon"'));
    failures := failures || 'unknown option accepted';
  exception when raise_exception then passed := passed + 1;
  end;
  perform public.submit_questionnaire(answers);
  begin
    perform public.submit_questionnaire(answers);
    failures := failures || 'questionnaire answered twice';
  exception when raise_exception then passed := passed + 1;
  end;

  -- 30 min a day -> 5 quests + the journal; a second call returns the same ones.
  select count(*) into n from public.assign_quests();
  if n = 6 then passed := passed + 1; else failures := failures || format('expected 6 quests, got %s', n); end if;
  perform public.assign_quests();
  select count(*) into n from public.quests where user_id = c and day = today;
  if n = 6 then passed := passed + 1; else failures := failures || format('quests generated twice: %s rows', n); end if;

  begin
    insert into public.quests (user_id, day, slot, quest_key, title, category, rp, tier)
      values (c, today, 9, 'my.own', 'Easy one', 'other', 3, 1);
    failures := failures || 'user inserted a quest';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    update public.quests set rp = 3 where user_id = c;
    failures := failures || 'user edited a quest';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    delete from public.quests where user_id = c;
    failures := failures || 'user deleted a quest';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- Today's quests override today's old tasks: nothing ticked -> today doesn't count.
  n := public.run_length(c, today);
  if n = 0 then passed := passed + 1; else failures := failures || format('unticked quests counted: %s', n); end if;
  for quest_c in select id from public.quests where user_id = c and day = today and quest_key <> 'journal.write' loop
    perform public.set_quest_done(quest_c, true);
  end loop;
  perform public.save_journal(today, 'Walked, slept on time.');
  n := public.run_length(c, today);
  if n = 2 then passed := passed + 1; else failures := failures || format('all quests ticked: expected run 2, got %s', n); end if;
  perform public.set_quest_done(quest_c, false);
  select count(*) into n from public.quests where id = quest_c and done_at is null;
  if n = 1 then passed := passed + 1; else failures := failures || 'untick did not clear done_at'; end if;

  -- Yesterday's quests can't be ticked.
  perform pg_temp.act_as_admin();
  insert into public.quests (user_id, day, slot, quest_key, title, category, rp, tier)
    values (c, today - 1, 1, 'move.walk', 'Walk', 'body', 3, 1) returning id into quest_c;
  perform pg_temp.act_as(c);
  begin
    perform public.set_quest_done(quest_c, true);
    failures := failures || 'ticked yesterday''s quest';
  exception when raise_exception then passed := passed + 1;
  end;

  -- B is not C's partner: no quests, no ticking them. Once paired: quests yes, answers no.
  perform pg_temp.act_as(b);
  select count(*) into n from public.quests where user_id = c;
  if n = 0 then passed := passed + 1; else failures := failures || 'stranger B reads C quests'; end if;
  begin
    perform public.set_quest_done(quest_c, true);
    failures := failures || 'B ticked C quest';
  exception when raise_exception then passed := passed + 1;
  end;
  perform pg_temp.act_as(c);
  select code into invite_code from public.create_invite();
  perform pg_temp.act_as(b);
  perform public.redeem_invite(invite_code);
  select count(*) into n from public.quests where user_id = c and day = today;
  if n = 6 then passed := passed + 1; else failures := failures || 'partner B cannot read C quests'; end if;
  select count(*) into n from public.questionnaires where user_id = c;
  if n = 0 then passed := passed + 1; else failures := failures || 'partner B reads C answers'; end if;
  begin
    perform public.build_quests(answers, 1, today);
    failures := failures || 'user can call build_quests directly';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- 10. Journal (0006) ----------------------------------------------------------------
  perform pg_temp.act_as(c);
  select id into quest_c from public.quests where user_id = c and day = today and quest_key = 'journal.write';
  if quest_c is not null then passed := passed + 1; else failures := failures || 'no journal quest today'; end if;
  begin
    perform public.set_quest_done(quest_c, false);
    failures := failures || 'journal quest unticked by hand';
  exception when raise_exception then passed := passed + 1;
  end;
  -- Tier 1 asks for 1 line: blank lines don't count, emptying the entry unticks the quest.
  perform public.save_journal(today, E'\n  \n');
  select count(*) into n from public.quests where id = quest_c and done_at is null;
  if n = 1 then passed := passed + 1; else failures := failures || 'blank journal ticked the quest'; end if;
  select count(*) into n from public.journal_entries where user_id = c and day = today;
  if n = 0 then passed := passed + 1; else failures := failures || 'blank journal kept an entry'; end if;
  perform public.save_journal(today, E'Hard day.\nStill walked.');
  select count(*) into n from public.quests where id = quest_c and done_at is not null;
  if n = 1 then passed := passed + 1; else failures := failures || 'journal did not tick the quest'; end if;
  begin
    perform public.save_journal(today - 1, 'Backdated');
    failures := failures || 'wrote yesterday''s journal';
  exception when raise_exception then passed := passed + 1;
  end;
  begin
    insert into public.journal_entries (user_id, day, body) values (c, today, 'direct');
    failures := failures || 'user inserted a journal entry directly';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  begin
    update public.journal_entries set body = 'x' where user_id = c;
    failures := failures || 'user updated a journal entry directly';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  -- Even the partner can't read it.
  perform pg_temp.act_as(b);
  select count(*) into n from public.journal_entries where user_id = c;
  if n = 0 then passed := passed + 1; else failures := failures || 'partner B reads C journal'; end if;
  perform pg_temp.act_as(c);
  select count(*) into n from public.journal_entries where user_id = c;
  if n = 1 then passed := passed + 1; else failures := failures || 'C cannot read own journal'; end if;

  -- 7. Signed-out (anon) gets nothing ------------------------------------------
  perform pg_temp.act_as_admin();
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.tasks;
    failures := failures || 'anon can query tasks';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  perform pg_temp.act_as_admin();

  -- Report and roll back --------------------------------------------------------
  if array_length(failures, 1) is null then
    raise exception 'RLS CHECK PASSED (% checks)', passed;
  else
    raise exception 'RLS CHECK FAILED: % passed, % failed: %', passed, array_length(failures, 1), array_to_string(failures, '; ');
  end if;
end;
$$;
