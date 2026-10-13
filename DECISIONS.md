# Decisions

Short log of why things are the way they are.

## Supabase as the whole backend

Postgres + Auth + Realtime + Edge Functions in one free project. Real SQL and Row Level Security instead of a custom API server, so security rules live next to the data.

## Email OTP code instead of a magic link

A 6-digit code typed into the app avoids deep-link setup in Expo Go (no redirect URL to configure, works the same on both phones). Supabase sends the code via the "Magic Link" email template, which must include `{{ .Token }}`.

## Session in SecureStore, chunked

The plan asks for `expo-secure-store` for the session. SecureStore values should stay under ~2 KB and a Supabase session is often bigger, so `src/lib/supabase.ts` splits it across numbered keys. No extra crypto dependency needed.

## Column-level grants on `profiles`

RLS decides _which rows_ a user may touch; column grants decide _which columns_. Users may insert/update their name, season start and timezone, but not `pair_id`, so nobody can attach themselves to someone else's pair. Pairing happens only in a `security definer` function (Milestone 2).

## Profiles created at onboarding, not by a trigger

The profile needs a display name and season start the user chooses, so the onboarding screen inserts it. The auth gate treats "signed in, no profile row" as "needs onboarding".

## Daily reset without cron

"Today" is the user's local date (`profiles.timezone`), computed on the client and stored with each completion. A daily task is unticked on a new day simply because there's no completion row for that day yet.

## Migrations split per milestone

`0001_profiles.sql` ships in Milestone 1 so sign-in and onboarding can be tested; the rest of the schema is `0002` in Milestone 2. Pushed migrations are never edited.

## Pairing only through `security definer` functions

`create_invite()`, `redeem_invite(code)` and `unpair()` are the only ways pairing state changes. The server generates invite codes with `gen_random_bytes` (alphabet without 0/O/1/I), so clients can't pick guessable codes. `redeem_invite` locks both profiles in a fixed order, so two people redeeming at once can't double-pair or deadlock. The plan said "create own" invites via RLS; a function was safer and simpler.

## `is_partner()` is `security definer`

Policies on `profiles` call `is_partner()`, which reads `profiles`. As a normal function, that read would apply the same policy again and recurse. `security definer` with an empty `search_path` reads the table directly and safely.

## Unpair keeps history

The active link is `profiles.pair_id`. Unpairing clears it on both profiles and stamps `pairs.ended_at`; tasks, completions and cheers stay.

## Completions only for "today ± 1 day"

The insert policy on `task_completions` accepts `day` within one day of the UTC date (every timezone's local date falls in that window). You can't backfill old days to fake a streak, while IST and other zones still work at midnight.

## Cheer limit as a trigger, not a policy

An RLS failure gives the generic "violates row-level security policy". A trigger can raise "You've sent 5 cheers today", which the app can show as is. The day boundary uses the sender's timezone.

## Coach messages are written only by the Edge Function

The app has read-only access to `coach_messages`. The `coach` Edge Function (service role) stores both the user's message and the reply, so the 30/day limit can't be bypassed by writing rows directly.

## RLS is tested against the real project

`supabase/tests/rls_check.sql` impersonates three throwaway users (owner, partner, stranger) inside a transaction and always raises at the end, so it rolls back. It runs against the hosted project without Docker.

## Respawn Points and the reset rule

Every task has a priority worth RP: High 3, Medium 2 (default), Low 1. A local day **counts** when the daily tasks ticked are worth at least half that day's possible RP, so skipping the 3-RP workout has to be made up elsewhere. **Day X of 60 is the current run of counting days**: one day that doesn't count sends you back to Day 1. That's the discipline mechanic. The Today list sorts by RP.

- `run_length(target, through)` (0004) scores each past day in SQL against the daily tasks that **existed that day**. `tasks.archived_at` (set by a trigger, not writable by users) means deleting a task never rewrites history, and new tasks don't affect earlier days.
- Priority is not snapshotted per day, so changing a task's priority re-scores its past days too. That's acceptable for Phase 1.
- The app asks the server for the run through **yesterday** and scores today itself from the cached tasks, so the streak and the "today counts" state update the instant you tick.
- Because it's `security invoker`, RLS applies: it works for your partner's run (Duo tab) and returns 0 for anyone else.
- This replaces 0003's simpler `current_streak` ("at least one daily task ticked").
- RP is the foundation for Phase 2 XP and levels.

## Optimistic ticks with rollback

Each write (tick, add, edit, delete) updates the TanStack Query cache first, then calls Supabase; on failure it restores the snapshot and shows a toast. Refetch happens only after the last in-flight write, so fast tapping doesn't flicker. New tasks get their UUID on the device (`expo-crypto`) so the optimistic row and the real row share an id.

## One-off tasks

A one-off is done if it has any completion. It stays in the main list on the day it's ticked (so you can untick it), then moves to the collapsible Done list from the next day.

