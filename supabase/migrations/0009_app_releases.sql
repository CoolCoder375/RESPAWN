-- App releases: the newest APK and where to download it. When the installed app's runtime version
-- (expo-updates fingerprint) isn't the newest one, the app shows a popup with the download link.
-- Only the service role (the developer, after each build) writes rows.

create table public.app_releases (
  runtime_version text primary key,
  apk_url text not null check (apk_url ~ '^https://'),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

alter table public.app_releases enable row level security;
revoke all on public.app_releases from anon, authenticated;
grant select on public.app_releases to authenticated;

create policy "app_releases: signed-in users read"
  on public.app_releases for select to authenticated
  using (true);
