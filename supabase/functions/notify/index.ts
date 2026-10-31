// Notify: pushes a cheer to the partner's phone(s) through the Expo push service.
// The app calls it right after inserting a cheer; the cheer itself is the proof, so a user can
// only push their own cheers, each one once.
//
//   Request:  POST { cheer_id: string } with the sender's session token
//   Response: 200 { sent: number } | 400 | 401 | 404 already pushed or not yours | 502 push failed

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const json = (status: number, body: unknown) => Response.json(body, { status });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(400, { error: 'POST only' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: 'Signed out' });
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth } = await db.auth.getUser(authorization.replace(/^Bearer /i, ''));
  if (!auth?.user) return json(401, { error: 'Signed out' });

  const body = await req.json().catch(() => null);
  const cheerId = typeof body?.cheer_id === 'string' ? body.cheer_id : '';
  if (!cheerId) return json(400, { error: 'cheer_id required' });

  // Claim the cheer: only the sender's own, only once.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: cheer, error: claimError } = await admin
    .from('cheers')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', cheerId)
    .eq('from_user', auth.user.id)
    .is('pushed_at', null)
    .select('to_user, message')
    .maybeSingle();
  if (claimError) return json(502, { error: claimError.message });
  if (!cheer) return json(404, { error: 'Not found or already pushed' });

  const [{ data: sender }, { data: tokens }] = await Promise.all([
    admin.from('profiles').select('display_name').eq('id', auth.user.id).single(),
    admin.from('push_tokens').select('token').eq('user_id', cheer.to_user),
  ]);
  if (!tokens?.length) return json(200, { sent: 0 });

  const name = sender?.display_name ?? 'Your partner';
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(
      tokens.map(({ token }) => ({
        to: token,
        title: `${name} cheered you on`,
        body: cheer.message.replace("'", '’'),
        sound: 'default',
        channelId: 'cheers',
        data: { url: '/' },
      })),
    ),
  }).catch((error) => error as Error);
  if (res instanceof Error || !res.ok) {
    console.error('push failed', res instanceof Error ? res : await res.text());
    return json(502, { error: 'Push failed' });
  }

  // Forget phones that uninstalled the app or turned the token off.
  const { data: tickets } = await res.json();
  const dead = tokens.filter((_, i) => tickets?.[i]?.details?.error === 'DeviceNotRegistered');
  if (dead.length) {
    await admin
      .from('push_tokens')
      .delete()
      .in(
        'token',
        dead.map((t) => t.token),
      );
  }

  return json(200, { sent: tokens.length - dead.length });
});
