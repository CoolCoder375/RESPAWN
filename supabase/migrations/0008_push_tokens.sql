-- Push notifications: each phone's Expo push token, so a cheer reaches the partner's phone
-- while Respawn is closed. The `notify` Edge Function (service role) reads them and sends the push.
--
--   * push_tokens: one row per phone. Nobody reads them through the API, not even the owner.
--   * register_push_token() / unregister_push_token(): the app's only way to write.
--     A token moves to whoever signed in last on that phone.

create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create function public.register_push_token(token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.push_tokens as t (token, user_id)
  values (register_push_token.token, auth.uid())
  on conflict (token) do update set user_id = excluded.user_id, updated_at = now();
end;
$$;

-- On sign-out, so the next person on this phone doesn't get your cheers.
create function public.unregister_push_token(token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens t
  where t.token = unregister_push_token.token and t.user_id = (select auth.uid());
$$;

revoke execute on function public.register_push_token(text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- A cheer is pushed once: notify() claims it by setting pushed_at.
alter table public.cheers add column pushed_at timestamptz;
