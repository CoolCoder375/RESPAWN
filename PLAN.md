# Respawn – Phase 1 Beta Build Plan

Oct 9, 2026 · @Atharva Deshpande

## Overview

Respawn Phase 1 is a small mobile beta with four features: a daily to-do list, one accountability partner, an AI coach powered by Gemini, and a daily thought screen. It is built first for one user (me) running a 60-day reset, plus one partner, and must be usable on my phone within 2 weeks.

Goals for Phase 1:

- Use it every day from day 1 of the 60 days, even if features are rough.
- See my partner's progress live, and let them see mine.
- Get short, adaptive advice from the coach based on today's tasks.
- Keep the codebase clean enough to show on a resume and extend in Phase 2.

How to use this doc with Claude Code: save it as `PLAN.md` in the repo root and add a `CLAUDE.md` that says "Follow PLAN.md. Build one milestone at a time, stop after each one, and list what to test." Ask Claude Code to start with Milestone 1 only.

## Scope

Phase 1 ships only what I need to start the 60 days; everything game-like waits for Phase 2.

| In Phase 1 | Not in Phase 1 (later) |
| --- | --- |
| Daily and one-off tasks, add/edit/delete/tick | XP, levels, Body/Mind/Focus/Recovery stats |
| Sign in with email magic link | Squads of 3–5, shield points, raids |
| Pair with exactly one partner via invite code | App blocking (Screen Time / UsageStats) |
| Live view of partner's tasks and today's progress | Health data sync, camera rep counting |
| Send a "cheer" to the partner | Push notifications (local reminder only, optional) |
| AI coach chat using Gemini | Seasons, pledge, recap card |
| Daily thought screen | Themes, dark/light switcher beyond system default |
| Day counter: "Day X of 60" | Web version |

Non-goals: no app store release in Phase 1. Run it through Expo Go or a development build on my own phone and my partner's.

## Tech stack

Use Expo (React Native) with TypeScript on the client and Supabase as the whole backend, so the app stays mobile-first and the Phase 2 app blocker can be added as a native module later.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Expo SDK (latest stable), React Native, TypeScript | One codebase for Android and iOS; runs on my phone via Expo Go |
| Navigation | Expo Router (file-based tabs) | Simple tab layout, standard for new Expo apps |
| Styling | NativeWind (Tailwind for RN) or StyleSheet with a `theme.ts` | Fast to build; tokens in one place |
| Server state | TanStack Query | Caching, loading and error states for Supabase calls |
| Auth | Supabase Auth, email magic link (or email OTP code) | No passwords to build |
| Database | Supabase Postgres with Row Level Security | Real SQL and security rules to talk about in interviews |
| Live updates | Supabase Realtime (Postgres changes) | Partner sees my ticks instantly |
| AI coach | Google Gemini API, free tier, called from a Supabase Edge Function | API key stays on the server, never in the app |
| Local storage | `expo-secure-store` for the session, AsyncStorage for cached thought | Standard Expo packages |
| Tooling | ESLint, Prettier, GitHub repo, `.env` for public keys | Clean repo for the resume |

Gemini notes:

- Get a key from Google AI Studio. Use the current free-tier Flash model; check the model name and rate limits in the Gemini API docs when you build, since they change.
- Use the official `@google/genai` SDK or plain `fetch` to the REST endpoint inside the Edge Function.
- Store the key with `supabase secrets set GEMINI_API_KEY=...`. Never put it in an `EXPO_PUBLIC_` variable, because those are bundled into the app.
- Free tier usage may be used by Google to improve its products, so don't send anything private beyond task titles and the chat.

## Feature specs

Each feature below lists what it does and the rules Claude Code must follow.

### 1. To-do (Today tab)

- Two task types: **daily** (repeats every day, resets unticked at local midnight) and **one-off** (stays until done, then moves to a Done list).
- Fields: title (1–80 chars), type, optional category tag (Body, Mind, Focus, Recovery, Other), created date.
- Completion is stored per day in a separate `task_completions` table, so history is kept for streaks and Phase 2 stats.
- Today screen shows: "Day X of 60" (from `season_start` on my profile), today's progress (e.g. 3 / 5), the task list, and an add-task input.
- Actions: add, tick/untick, edit title, delete (with confirm), reorder is optional.
- Optimistic updates: ticking feels instant, then syncs; roll back with an error toast if the write fails.
- Empty state: "Add your first task for today" with 3 suggested tasks to tap (walk 20 min, journal one line, lights out by 11:30).
- Streak: count consecutive days where at least one daily task was completed. Show it on the Today header.

### 2. Partner (Duo tab)

- Exactly one partner per user in Phase 1.
- Pairing: I tap "Create invite", get a 6-character code (valid 48 h, single use). My partner enters it on their phone. Both profiles then point to one `pairs` row.
- Duo tab shows two cards side by side: me and partner, each with name, today's progress (done / total), streak, and Day X of 60.
- Below: partner's task list for today, read-only, with ticks updating live through Supabase Realtime.
- Cheer button: sends a short preset message ("Keep going", "Proud of you", "You've got this") that appears as a banner on the partner's Today tab next time they open it. Limit 5 cheers per day.
- Unpair: in Settings, with confirm. Data is kept, the link is removed.
- Privacy: partner can see task titles, completion state and streak. Partner can never see coach chats.

### 3. Coach (Coach tab)

- A chat screen. The coach speaks as "Future You", me on Day 60: warm, direct, short (max 120 words per reply), practical.
- Every request sends context with the message: Day X of 60, today's tasks with done/pending, current streak, and the last 10 chat messages.
- Quick-start chips above the input: "Plan my day", "Low energy today", "I missed yesterday", "Review my week".
- Flow: app → Supabase Edge Function `coach` (checks the user's session) → Gemini → reply saved to `coach_messages` → shown in chat.
- Limits: max 30 coach messages per user per day, enforced in the Edge Function, to stay inside the free tier. Show a friendly message when the limit is reached.
- Errors: if Gemini fails or times out (15 s), show "Coach is offline right now, try again in a minute" and keep the typed message.
- Safety rules in the system prompt: no medical diagnosis, no extreme diets or calorie targets, no punishment-based advice; suggest seeing a professional for pain, injury or persistent low mood.
- Coach chats are private to the user (RLS).

Starting system prompt (Claude Code should put this in `supabase/functions/coach/prompt.ts`):

```
You are "Future You": the user, 60 days from now, after finishing their reset.
Speak in first person as their future self. Be warm, direct and brief (max 120 words).
Use the context: day number, today's tasks, streak, recent chat.
Give one or two concrete next actions, not lists of ten.
On low-energy days, make the plan smaller instead of skipping it.
Never give medical diagnoses, calorie targets or extreme diet or training advice.
If the user mentions pain, injury or ongoing low mood, suggest a doctor or someone they trust.
```

### 4. Thought of the day (Thought tab)

- One short thought per day, the same all day, chosen by date from a local list of 60 original lines in `src/data/thoughts.ts` (one per day of the season).
- Write the lines yourself or have Claude Code draft them; avoid copying quotes from books or song lyrics.
- Screen: large text centered, small "Day X" label, a "Save" button (adds to a Saved list) and a "Share" button (system share sheet with the text).
- Optional later: "Ask Coach about this" opens the Coach tab with the thought pre-filled.

## Data model and security

Seven Postgres tables, all with Row Level Security on. Claude Code should write them as one SQL migration in `supabase/migrations/`.

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id` (= auth user id), `display_name`, `season_start` (date), `timezone`, `pair_id` (nullable) | Created on first sign-in |
| `pairs` | `id`, `user_a`, `user_b`, `created_at` | One row per partnership |
| `pair_invites` | `code` (6 chars, unique), `created_by`, `expires_at`, `used_at` | Single use, 48 h expiry |
| `tasks` | `id`, `user_id`, `title`, `kind` (`daily` / `once`), `category`, `position`, `archived`, `created_at` | `archived` instead of hard delete keeps history |
| `task_completions` | `task_id`, `user_id`, `day` (date, user's local day), `completed_at` | Unique on (`task_id`, `day`) |
| `cheers` | `id`, `from_user`, `to_user`, `message`, `created_at`, `seen_at` | Max 5 per sender per day |
| `coach_messages` | `id`, `user_id`, `role` (`user` / `coach`), `content`, `created_at` | Private to owner |

Row Level Security rules:

- `profiles`: read own row and the partner's row; update own row only.
- `tasks` and `task_completions`: full access to own rows; **read-only** access to the partner's rows (partner = the other user in my `pairs` row).
- `cheers`: insert where `from_user` is me and `to_user` is my partner; read rows where I'm sender or receiver; receiver can set `seen_at`.
- `coach_messages`: only the owner can read; only the `coach` Edge Function (service role) inserts coach replies.
- `pair_invites`: create own; redeeming goes through a Postgres function `redeem_invite(code)` (security definer) that checks expiry and use, creates the `pairs` row and sets `pair_id` on both profiles.

Write a small SQL helper `is_partner(other uuid)` returning true when `other` is in the same pair as `auth.uid()`, and use it in the policies.

"Today" is the user's local date from `profiles.timezone`, computed on the client and sent with each completion, so the daily reset works in India (IST) without server cron jobs.

## Screens and design

Four bottom tabs plus sign-in and settings, matching the Respawn mockups (dark, lime accent, chunky display type).

| Screen | Route | Contents |
| --- | --- | --- |
| Sign in | `app/(auth)/sign-in.tsx` | Email field, "Send code" button, 6-digit code entry |
| Onboarding | `app/(auth)/onboarding.tsx` | Display name, season start date (default today) |
| Today | `app/(tabs)/index.tsx` | Day X of 60, streak, progress bar, cheer banner, task list, add input |
| Duo | `app/(tabs)/duo.tsx` | Invite / enter code if unpaired; two progress cards, partner's tasks, cheer buttons if paired |
| Coach | `app/(tabs)/coach.tsx` | Chat list, quick-start chips, input, send button |
| Thought | `app/(tabs)/thought.tsx` | Today's thought, Save, Share, Saved list link |
| Settings | `app/settings.tsx` | Name, season start, unpair, sign out |

Design tokens (put in `src/theme.ts`):

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0D0E11` | Screen background |
| `surface` | `#17191E` | Cards, list rows |
| `line` | `#262930` | Dividers, empty bars |
| `text` | `#F2F3F5` | Main text |
| `muted` | `#9BA1AB` | Secondary text |
| `accent` | `#C8F04A` | Primary buttons, done state, active tab |
| `mind` / `focus` / `recovery` | `#8AB4FF` / `#FFB067` / `#C4A8FF` | Category tags |

Fonts: Unbounded (headings) and Space Grotesk (body) via `@expo-google-fonts`. Touch targets at least 44 px. Respect system font scaling. Add a haptic tap (`expo-haptics`) when a task is ticked.

## Project structure and setup

One repo holds the Expo app and the Supabase folder, so Claude Code can see both.

```
respawn/
  app/
    (auth)/sign-in.tsx, onboarding.tsx
    (tabs)/_layout.tsx, index.tsx, duo.tsx, coach.tsx, thought.tsx
    settings.tsx
    _layout.tsx            # auth gate, fonts, QueryClient
  src/
    lib/supabase.ts        # client with secure-store session
    lib/dates.ts           # local day, Day X of 60, streak
    hooks/                 # useTasks, usePartner, useCoach, useCheers
    components/            # TaskRow, ProgressCard, ChatBubble, ...
    data/thoughts.ts
    theme.ts
  supabase/
    migrations/0001_init.sql
    functions/coach/index.ts, prompt.ts
  .env.example
  PLAN.md
  CLAUDE.md
  README.md
```

Setup steps (one-time):

1. Install Node LTS, then create the app: `npx create-expo-app@latest respawn --template default`, and pick TypeScript.
2. Create a free Supabase project. Install the Supabase CLI and run `supabase init` and `supabase link`.
3. In Supabase Auth settings, enable email sign-in with OTP code.
4. Put `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` (these two are safe to bundle; RLS protects data).
5. Get a Gemini API key from Google AI Studio and run `supabase secrets set GEMINI_API_KEY=...`.
6. Install Expo Go on both phones and run `npx expo start`.

Add `.env` to `.gitignore` and commit `.env.example` with empty values.

## Build milestones

Six milestones over about 2 weeks; I start using the app after Milestone 3, even before the rest is done.

1. **Skeleton (day 1–2).** Expo app with four empty tabs, theme, fonts, Supabase client, email OTP sign-in and onboarding.
   - [ ] I can sign in on my phone and see four tabs.
   - [ ] A `profiles` row exists with my name and season start.
2. **Database (day 2–3).** Migration with all tables, RLS policies, `is_partner()` and `redeem_invite()`.
   - [ ] Migration runs cleanly with `supabase db push`.
   - [ ] Test: a second test user cannot read my tasks before pairing.
3. **Today tab (day 3–5).** Tasks CRUD, daily/one-off logic, per-day completions, Day X of 60, streak, empty state.
   - [ ] Daily tasks show unticked again the next local day.
   - [ ] Ticking is instant and survives an app restart.
4. **Thought tab (day 5).** 60 thoughts, date-based pick, Save and Share.
   - [ ] Same thought all day; a new one tomorrow.
5. **Duo tab (day 6–8).** Invite code, redeem, progress cards, live partner list, cheers with banner.
   - [ ] My partner's tick shows on my phone within 2 seconds.
   - [ ] Partner can't edit my tasks or see my coach chat.
6. **Coach tab (day 8–11).** Edge Function, Gemini call with context, daily limit, chat UI, chips, error states.
   - [ ] "Low energy today" gives a smaller plan that mentions my actual tasks.
   - [ ] No Gemini key appears anywhere in the app bundle or repo.

Days 12–14: fix bugs from daily use, write the README with screenshots and a short screen recording.

Prompt to give Claude Code at each step: "Read PLAN.md. Implement Milestone N only. Explain each file you create, then give me the steps to test the checkboxes."

## Phase 2 and resume notes

Phase 1 data is designed so Phase 2 can be added without migrations that break history.

Phase 2 candidates, in rough order:

- XP, levels and the four life stats, computed from `task_completions` and `category`.
- Squads of 3–5 with shared shield points and weekly raids.
- Focus Lock: app blocking through iOS Screen Time APIs and Android UsageStatsManager plus an overlay, as a custom Expo native module.
- Health Connect and HealthKit sync for steps and sleep.
- Seasons: Day-1 pledge, 8-week arc, shareable Day 60 recap card.

Resume line once Phase 1 ships:

> Built Respawn, a cross-platform accountability app (Expo, React Native, TypeScript, Supabase) with real-time partner sync, Postgres row-level security, and an AI coach using Gemini through a serverless Edge Function; used it daily for a 60-day personal reset.

Keep a short `DECISIONS.md` log (why Supabase, why an Edge Function for the key, how daily reset works). It gives you ready answers for interviews.
