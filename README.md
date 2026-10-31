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
- [x] Journal: a daily journal quest, ticked by writing the entry or by "I wrote it in my notebook" (private, today only)
- [x] Notifications: cheers arrive as push notifications (FCM via Expo push)
- [x] Today: quests in Morning / Anytime / Night clumps
- [x] Milestone 6 – Coach tab: "Future You" chat through the `coach` Edge Function and Gemini, with your quests, Day X, streak and last week as context; 30 messages a day

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
5. Coach: get a Gemini API key from Google AI Studio and store it as a Supabase secret, then deploy the function. Run the secret command in your own terminal, so the key never lands in a file or chat:
   ```sh
   npx supabase secrets set GEMINI_API_KEY=<your-key>
   npx supabase functions deploy coach --use-api
   ```
   Optional: `GEMINI_MODEL` overrides the model (default `gemini-3.6-flash`).
6. `npx expo start`, then scan the QR code with Expo Go.

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

Updates:

- JavaScript-only change: `npx eas-cli update --channel preview --environment preview -m "<what changed>"`. Phones get it the next time the app opens (twice: download, then apply), with no reinstall.
- Native change (new native library, icon, permissions): build a new APK and install it over the old one. Data lives in Supabase, and the same signing key means it installs as an update, so nobody is signed out.
  After the build, record it so older apps show the "New version" popup with the download link (runtime version and APK URL from `npx eas-cli build:view <id> --json`):
  ```sql
  insert into public.app_releases (runtime_version, apk_url, notes) values ('<runtime>', '<apk url>', '<what changed>');
  ```

Push notifications need Firebase: `google-services.json` at the repo root (set in `app.json` → `android.googleServicesFile`), and the Firebase service account key uploaded to EAS (expo.dev → project → Credentials → Android → FCM V1 service account key). Never commit the service account key.
