# Respawn

Follow PLAN.md. Build one milestone at a time, stop after each one, and list what to test.

@AGENTS.md

## Project rules

- Routes in `app/`, everything else in `src/` (imported as `@/...`). Design tokens only from `src/theme.ts`.
- Supabase schema changes are new files in `supabase/migrations/` — never edit a migration that has been pushed.
- Every table has RLS on. Users never write `profiles.pair_id` directly (column grants block it).
- "Today" is the user's local day from `profiles.timezone` (`src/lib/dates.ts`), computed on the client.
- Secrets (Gemini key, service role key) only via `supabase secrets set`, never `EXPO_PUBLIC_*`.
- Run the Supabase CLI as `npx supabase ...`.
- Before calling a task done: `npm run lint` and `npm run typecheck`.
- Record notable design choices in DECISIONS.md.
