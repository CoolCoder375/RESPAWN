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
  values (a, 'A', 'Asia/Kolkata'), (b, 'B', 'Asia/Kolkata'), (c, 'C', 'UTC');
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

  update public.tasks set title = 'hacked' where id = task_a;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failures := failures || 'B edited A task'; end if;

  update public.tasks set archived = true where id = task_a;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failures := failures || 'B archived A task'; end if;

  delete from public.task_completions where task_id = task_a;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failures := failures || 'B unticked A task'; end if;

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

  -- 4. Completions: own tasks only, today +/- 1 day only ----------------------
  perform pg_temp.act_as(a);
  begin
    insert into public.task_completions (task_id, day) values (task_a, today - 10);
    failures := failures || 'A backfilled a completion 10 days ago';
  exception when insufficient_privilege then passed := passed + 1;
  end;
  delete from public.task_completions where task_id = task_a and day = today;
  insert into public.task_completions (task_id, day) values (task_a, today);
  select count(*) into n from public.task_completions where task_id = task_a and user_id = a;
  if n = 1 then passed := passed + 1; else failures := failures || 'A cannot untick/tick own task'; end if;

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
