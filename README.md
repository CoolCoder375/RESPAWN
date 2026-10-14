# Respawn

A 60-day reset app: daily to-dos, one accountability partner, an AI coach ("Future You", powered by Gemini) and a daily thought.

Built with Expo (React Native, TypeScript, Expo Router), TanStack Query and Supabase (Postgres + RLS, Auth, Realtime, Edge Functions). See [PLAN.md](PLAN.md) for the build plan and [DECISIONS.md](DECISIONS.md) for design choices.

## Status

- [x] Milestone 1 – Skeleton: tabs, theme, fonts, Supabase client, email OTP sign-in, onboarding
- [x] Milestone 2 – Database: schema, RLS, pairing functions, RLS test
- [x] Milestone 3 – Today tab: tasks, daily/one-off, Respawn Points (priority), per-day ticks, Day X of 60 run with reset, streak
- [x] Milestone 4 – Thought tab: verse of the day from the Gita and Puranas (Sanskrit, IAST, plain English, reflection), Save, Share
- [x] Milestone 4.5 – Quests: 20-question questionnaire, daily quests assigned and locked by the server (see QUESTS.md)
- [x] Milestone 5 – Duo tab: invite code, live partner quests and progress cards, cheers with banner, unpair
- [x] Journal: a daily journal quest, ticked by writing the entry (private, today only)
- [ ] Milestone 6 – Coach tab

## Setup

1. `npm install`
2. Create a Supabase project. Copy `.env.example` to `.env` and fill in the project URL and anon (publishable) key.
3. Link and push the schema:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
4. In the Supabase dashboard → Authentication → Emails → **Magic Link** template, include the code: `Your Respawn code is {{ .Token }}`.
5. `npx expo start`, then scan the QR code with Expo Go.

## Scripts

| Command                                                          | What it does                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm start`                                                      | Start the Expo dev server                                      |
| `npm run lint`                                                   | ESLint (expo config + prettier)                                |
| `npm run typecheck`                                              | `tsc --noEmit`                                                 |
| `npm run format`                                                 | Prettier                                                       |
| `npm run gen:types`                                              | Regenerate `src/lib/database.types.ts` from the linked project |
| `npx supabase db query --linked -f supabase/tests/rls_check.sql` | Run the RLS checks (rolls back; prints `RLS CHECK PASSED`)     |

## Structure

```
app/            Expo Router screens: (auth)/, (tabs)/, settings, root layout with the auth gate
src/lib/        supabase client, auth context, date helpers
src/hooks/      TanStack Query hooks (useProfile, ...)
src/components/ shared UI
src/theme.ts    design tokens
supabase/       config, migrations, edge functions
```

## Android APK (no laptop needed)

One-time: an Expo account, `npx eas-cli login`, `npx eas-cli init`, and the two Supabase values in the EAS `preview` environment:

```bash
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value <url> --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <publishable key> --visibility plaintext
```

Build: `npx eas-cli build -p android --profile preview`. The build page gives a link and QR code to download and install the APK.
