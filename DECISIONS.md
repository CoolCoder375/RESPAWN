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

## The notebook counts as a journal

Some days the journal is on paper. `set_journal_on_paper(day, on_paper)` marks today's entry as written in a notebook, which ticks the journal quest with no text (0007). It's honour-based on purpose: typing a fake line was always possible, so a button is more honest than pushing people to type filler. Both writers call `sync_journal_quest()`, so the tick is computed in one place: on paper, or enough lines.

## Coach messages are written only by the Edge Function

The app has read-only access to `coach_messages`. The `coach` Edge Function (service role) stores both the user's message and the reply, so the 30/day limit can't be bypassed by writing rows directly.

## Coach: context on the server, nothing saved on failure

- **Context is built in the Edge Function** with the user's own session (so RLS applies): today's quests via `assign_quests()`, Day X and streak from `run_length()`, the last 7 days' RP, and the last 10 messages. The app only sends the text, so a modified app can't feed the coach fake context, and the prompt stays on the server (`supabase/functions/coach/prompt.ts`).
- **The journal is not sent.** It's private, even from the coach.
- **Saved only on success:** both messages are inserted after Gemini answers. A failure or the 15 s timeout saves nothing, doesn't count toward the 30/day limit, and the app keeps the typed text.
- **The limit counts by local day** (`profiles.timezone`), like everything else.
- **Model is a secret, not code:** `GEMINI_MODEL` can switch models without a redeploy of the app.

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

## Verse of the day from public-domain scripture

The Thought tab shows one verse a day: 33 from the Bhagavad Gita and 27 from the Puranas (Bhagavatam, Vishnu, Garuda, Markandeya, Matsya), in `src/data/verses/`.

- **Sanskrit** is public domain. Gita text comes from github.com/gita/gita (Unlicense); the Purana text comes from sa.wikisource.org, with its e-text typos corrected against GRETIL. The IAST transliteration is generated.
- **English** is a plain modern rendering written for Respawn, based on a translation that is out of copyright, named in each verse's `basedOn`: Telang 1882, Wilson 1840, Dutt 1895/1908, Pargiter 1904, or Sacred Books of the Hindus 1917. The translations in the gita/gita data (Gambirananda, Sivananda and others) and Vedabase/BBT, Gita Press and Motilal are copyrighted, so none are used, even where a repo's license claims otherwise.
- **No AI-generated verses or citations.** Every Sanskrit and source string was copied from a fetched source and spot-checked. The reflections are original writing and are labelled as such ("For today").
- **Bundled, not fetched,** so it works offline and stays the same all day. The verse is picked by calendar day of the season (not the run's Day X), so a reset never repeats a verse. The `Verse` shape is meant to become a standalone open dataset or static JSON API later.

## Saved verses stay on the device

Saved verses are kept in AsyncStorage per user, by verse id, since the plan's data model has no table for them. They don't sync across devices.

## Quests replace hand-made tasks

Writing your own tasks let you make the day easy whenever you wanted, so the streak meant little. Since Milestone 4.5, Respawn assigns the day's quests from a 20-question questionnaire, and they're **fully locked**: no add, edit, swap or delete. The rules are in QUESTS.md.

- **Rules in Postgres, not an Edge Function.** `build_quests()` is a pure SQL/plpgsql function. `assign_quests()` and `set_quest_done()` are `security definer` and are the only way to create or tick quests. Users have no write grants on `quests`, `questionnaires`, `tasks` or `task_completions`. So the lock is enforced by the database, there's nothing to deploy, and `rls_check.sql` tests it.
- **The server decides "today"** from `profiles.timezone`, so the client can't generate or tick another day's quests.
- **Rule-based, not AI**, for now. It's free, works without a key, is deterministic and testable. Gemini personalisation can come in Milestone 6.
- **The tier follows Day X**, so a reset also drops quests back to Foundation.
- **Old tasks** were archived by migration 0005 and stay as read-only history; `run_length()` uses them for days before quests existed, so existing runs carry over.
- **Answers are once only** in Phase 1. Retaking belongs with new seasons.

## The journal is written, not ticked

Journaling was only an optional mind quest that the scoring rarely picked. Since migration 0006, every day has a "Write N lines in your journal" quest (2 RP; 1 / 2 / 3 / 5 lines by tier).

- **Proof, not honour:** `set_quest_done()` refuses the journal quest. `save_journal(day, body)` writes the entry and ticks or unticks the quest from the non-blank line count, so the tick always matches what was written.
- **Same lock as quests:** users have no write grants on `journal_entries`; today only, with the 10-minute grace after the day ends at 4 am.
- **Private:** only the author can read an entry, not the partner, unlike quests.
- **Added in `assign_quests()`, not `build_quests()`:** the journal quest is appended after generation, and it's also added to a day that was generated before 0006, so it appeared on the day it shipped. If the rules had already picked the optional `mind.journal`, that quest is dropped, so a calm-goal day doesn't get two journal quests.

## Duo: live updates refetch, they don't patch

The Duo tab subscribes to Supabase Realtime `postgres_changes` on the partner's `quests` (and your incoming `cheers`) and simply refetches that query on any event. It doesn't merge payloads into the cache, so the screen always shows what RLS returns. A partner's tick arrives in about 0.6 s in the live two-user test (the plan's target is under 2 s).

- `profiles` isn't in the Realtime publication, so pairing is picked up by refetching your profile every 5 s while your invite code is live, and whenever the Duo tab gets focus (covers the partner unpairing).
- The partner's card is computed with the same `dayStatus()` as your Today header, using their own timezone for "today" and `run_length()` (RLS lets a partner call it).
- A partner who hasn't opened the app today has no quests yet; the card says so instead of showing 0 / 0.
- Cheers show as a banner on the receiver's Today tab until dismissed (`seen_at`), and arrive live. The 5-a-day limit is the existing database trigger; the app only displays it.

## Android builds via EAS, with the Supabase settings as EAS environment variables

`eas.json` has a `preview` profile that builds an installable APK (internal distribution). The two `EXPO_PUBLIC_*` values come from the EAS `preview` environment (`eas env:create`), not from the gitignored `.env`, which EAS Build never sees. Both values are public by design; the Gemini key will never be one of them.

## Cheer pushes: the sender's app asks, the server checks

A cheer reaches the partner's phone as a push (Expo push service → FCM). After inserting a cheer, the app calls the `notify` Edge Function with its id. The function only pushes a cheer the caller sent, and only once (it claims `cheers.pushed_at`), so the call can't be used to spam. Push tokens live in `push_tokens`, written only through `register_push_token()`; nobody can read them through the API. A database trigger with `pg_net` would push even if the sender's app died mid-send, but it needs a shared secret stored in the database; the client call is simpler, and the cheer still shows in the in-app banner if the push is lost.

## Over-the-air updates

`expo-updates` with the `fingerprint` runtime policy: JavaScript-only changes ship with `eas update --channel preview` and arrive the next time the app opens. A change that touches native code (a new native library, icon, permissions) changes the fingerprint, so it needs a new APK; an old APK never receives an update it can't run.

## Font scaling is capped, not ignored

The app follows the phone's font size, but each text style stops growing at a cap (`maxFontScale` in `src/theme.ts`: 1.15× for the big headings, 1.3× for body text). On phones narrower than 380 dp, headings are also a little smaller. Before this, a phone set to large fonts wrapped "Day 12 of 60" over three lines and pushed the quests off screen.

## Quests in time-of-day clumps

Seven quests in one list looked like a lot on Day 1, even at the easiest tier. The Today screen now groups them into Morning / Anytime / Night (`src/lib/questTimes.ts`, by quest key). Only the clump for the time of day starts open; the others fold to a "2/3 · 5/7 RP" header. The grouping is display-only: the quests, RP and the 50% rule are unchanged.

## Update popups

Two popups, one per kind of update (`src/hooks/useAppUpdates.ts`). A JavaScript update downloads in the background (also checked when the app returns to the foreground), then asks "Restart". A new APK can't arrive over the air, so its runtime version and download link go in `app_releases` after each build. An app whose runtime version isn't the newest one shows "New version of Respawn" with a Download button. Each popup shows once per app launch, and "Later" is always allowed.


## Quest reminders are local notifications

The evening reminder (8 pm, phone time) is scheduled on the phone with expo-notifications, not sent
from the server. It needs no Firebase, cron job or server, and works offline. It's rescheduled each
time today's quests change, so it carries the real count and is cancelled once nothing is left. Two
generic reminders for the next days cover days the app isn't opened. Without the exact-alarm
permission Android may deliver it a few minutes late, which is fine for a reminder.

Push registration errors are shown in Settings → Notifications instead of only being logged, because
an APK has no visible console.

## A day ends at 4 am

Quests, ticks, the journal, the cheer limit and the coach's daily limit all use a day that runs from
4 am to 4 am local time (`public.respawn_day()`, mirrored by `localDay()` in `src/lib/dates.ts`).
With midnight, "Lights out by 1:00 am" could only be ticked before doing it, and by morning the day
was locked: night quests were done far less often than the rest. Nobody meaningfully starts a new
day between midnight and 4 am, so 1 am belongs to the evening before. Stored days are unchanged.

## Sleep quests are ticked the next morning

"Lights out by 1:00 am" asked you to pick the phone back up right after putting it away, so it was
rarely ticked honestly. Sleep quests are now check-ins on the night before ("Slept by 1:00 am last
night"), in the Morning group. The Night group only has quests you can tick as soon as they're done
(migration 0011). Quests generated before 0011 keep their titles and stay in Night.

## Coach latency

Gemini replies took 12–16 s in live tests, even with `thinkingLevel: 'low'`. The function now waits
25 s before answering "offline" (it was 15 s, which a 16 s reply would have missed). The app shows
"typing…" meanwhile. If replies stay this slow, try a faster model through the `GEMINI_MODEL` secret.

## Cheer banner fades after 8 seconds

The banner used to stay until its close button was tapped, and a dismissal that failed to save
brought it back on the next refetch (your four cheers were never marked seen, though the same
update works from a test client). Now it fades after 8 s on screen or on tap, the dismissal retries
3 times and shows a toast if it still fails, and cheers older than a day never show.
