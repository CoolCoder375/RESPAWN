# Decisions

Short log of why things are the way they are.

## Supabase as the whole backend
Postgres + Auth + Realtime + Edge Functions in one free project. Real SQL and Row Level Security instead of a custom API server, so security rules live next to the data.

## Email OTP code instead of a magic link
A 6-digit code typed into the app avoids deep-link setup in Expo Go (no redirect URL to configure, works the same on both phones). Supabase sends the code via the "Magic Link" email template, which must include `{{ .Token }}`.

## Session in SecureStore, chunked
The plan asks for `expo-secure-store` for the session. SecureStore values should stay under ~2 KB and a Supabase session is often bigger, so `src/lib/supabase.ts` splits it across numbered keys. No extra crypto dependency needed.

## Column-level grants on `profiles`
RLS decides *which rows* a user may touch; column grants decide *which columns*. Users may insert/update their name, season start and timezone, but not `pair_id`, so nobody can attach themselves to someone else's pair. Pairing happens only in a `security definer` function (Milestone 2).

## Profiles created at onboarding, not by a trigger
The profile needs a display name and season start the user chooses, so the onboarding screen inserts it. The auth gate treats "signed in, no profile row" as "needs onboarding".

## Daily reset without cron
"Today" is the user's local date (`profiles.timezone`), computed on the client and stored with each completion. A daily task is unticked on a new day simply because there's no completion row for that day yet.

## Migrations split per milestone
`0001_profiles.sql` ships in Milestone 1 so sign-in and onboarding can be tested; the rest of the schema is `0002` in Milestone 2. Pushed migrations are never edited.
