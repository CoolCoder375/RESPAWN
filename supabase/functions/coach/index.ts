// Coach: the app sends a message, this function adds the user's context, asks Gemini, and saves
// both sides of the exchange to coach_messages. The Gemini key never leaves the server.
//
//   Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional)
//   Request:  POST { message: string } with the user's session token
//   Response: 200 { messages, remaining } | 400 bad message | 401 signed out | 429 daily limit | 503 offline

import { createClient } from 'npm:@supabase/supabase-js@2';

import { describeContext, SYSTEM_PROMPT, type PastDay } from './prompt.ts';

const DAILY_LIMIT = 30;
const MAX_MESSAGE_LENGTH = 1000;
const HISTORY_LENGTH = 10;
// Past this the app shows "offline".
const TIMEOUT_MS = 25_000;
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Failure = 'bad_request' | 'unauthorized' | 'limit' | 'offline';

const FAILURES: Record<Failure, { status: number; message: string }> = {
  bad_request: { status: 400, message: 'Type a message first (up to 1000 characters).' },
  unauthorized: { status: 401, message: 'Sign in again to talk to your coach.' },
  limit: {
    status: 429,
    message: `That’s ${DAILY_LIMIT} messages today. Go do the next quest, and we’ll talk tomorrow.`,
  },
  offline: { status: 503, message: 'Coach is offline right now, try again in a minute.' },
};

function fail(error: Failure, detail?: unknown) {
  if (detail) console.error(error, detail);
  const { status, message } = FAILURES[error];
  return Response.json({ error, message }, { status });
}

/** The Respawn day ("YYYY-MM-DD", ends at 4 am) for `date` in `timezone`. Matches src/lib/dates.ts. */
function localDay(timezone: string, date = new Date()): string {
  const shifted = new Date(date.getTime() - 4 * 3_600_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted);
}

function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('bad_request');

  // 1. Who's asking. Reads below use their session, so RLS applies as in the app.
  const authorization = req.headers.get('Authorization');
  if (!authorization) return fail('unauthorized');
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth, error: authError } = await db.auth.getUser(
    authorization.replace(/^Bearer /i, ''),
  );
  if (authError || !auth.user) return fail('unauthorized', authError);
  const uid = auth.user.id;

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LENGTH) return fail('bad_request');

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('display_name, season_start, timezone')
    .eq('id', uid)
    .single();
  if (profileError) return fail('unauthorized', profileError);
  const today = localDay(profile.timezone);

  // 2. Daily limit: the user's messages since the day started at 4 am (failed calls aren't saved).
  const { data: recent, error: recentError } = await db
    .from('coach_messages')
    .select('created_at')
    .eq('user_id', uid)
    .eq('role', 'user')
    .gte('created_at', new Date(Date.now() - 26 * 3_600_000).toISOString());
  if (recentError) return fail('offline', recentError);
  const sentToday = recent.filter(
    (m) => localDay(profile.timezone, new Date(m.created_at)) === today,
  );
  if (sentToday.length >= DAILY_LIMIT) return fail('limit');

  // 3. Context: today's quests, Day X, streak, the last week and the recent chat.
  const weekStart = addDays(today, -7);
  const [quests, run, history] = await Promise.all([
    db.rpc('assign_quests'),
    db.rpc('run_length', { target: uid, through: addDays(today, -1) }),
    db
      .from('coach_messages')
      .select('role, content')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LENGTH),
  ]);
  const { data: pastQuests } = await db
    .from('quests')
    .select('day, rp, done_at')
    .eq('user_id', uid)
    .gte('day', weekStart)
    .lt('day', today);
  if (history.error) return fail('offline', history.error);

  const todayQuests = (quests.data ?? []).map(
    (q: { title: string; rp: number; done_at: string | null }) => ({
      title: q.title,
      rp: q.rp,
      done: !!q.done_at,
    }),
  );
  const earned = todayQuests.reduce(
    (sum: number, q: { rp: number; done: boolean }) => sum + (q.done ? q.rp : 0),
    0,
  );
  const possible = todayQuests.reduce((sum: number, q: { rp: number }) => sum + q.rp, 0);
  const runThroughYesterday = run.data ?? 0;
  const seasonDay =
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${profile.season_start}T00:00:00Z`)) /
        86_400_000,
    ) + 1;

  const week = new Map<string, PastDay>();
  for (const q of pastQuests ?? []) {
    const day = week.get(q.day) ?? { day: q.day, earned: 0, possible: 0 };
    day.possible += q.rp;
    if (q.done_at) day.earned += q.rp;
    week.set(q.day, day);
  }

  const context = describeContext({
    name: profile.display_name,
    today,
    localTime: new Intl.DateTimeFormat('en-GB', {
      timeZone: profile.timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date()),
    dayX: Math.min(runThroughYesterday + 1, seasonDay),
    seasonDay,
    streak: runThroughYesterday + (possible > 0 && earned * 2 >= possible ? 1 : 0),
    quests: todayQuests,
    week: [...week.values()].sort((a, b) => a.day.localeCompare(b.day)),
  });

  // 4. Ask Gemini. Gemini wants turns to alternate, starting with the user.
  const turns: { role: 'user' | 'model'; text: string }[] = [];
  for (const m of [...history.data].reverse()) {
    const role = m.role === 'coach' ? 'model' : 'user';
    if (turns.length === 0 && role === 'model') continue;
    const last = turns[turns.length - 1];
    if (last?.role === role) last.text += `\n\n${m.content}`;
    else turns.push({ role, text: m.content });
  }
  if (turns[turns.length - 1]?.role === 'user') turns.pop();
  turns.push({ role: 'user', text: `${context}\n\n${message}` });

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return fail('offline', 'GEMINI_API_KEY is not set');

  let reply: string;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            // A short coaching reply doesn't need deep reasoning, and the default level took ~14 s.
            thinkingConfig: { thinkingLevel: 'low' },
          },
        }),
      },
    );
    if (!res.ok) return fail('offline', `Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const parts: { text?: string; thought?: boolean }[] =
      data.candidates?.[0]?.content?.parts ?? [];
    reply = parts
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join('')
      .trim()
      .slice(0, 4000);
    if (!reply) return fail('offline', `Empty reply: ${JSON.stringify(data).slice(0, 500)}`);
  } catch (error) {
    return fail('offline', error);
  }

  // 5. Save both sides. Only the service role can write coach_messages.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const now = Date.now();
  const { data: saved, error: saveError } = await admin
    .from('coach_messages')
    .insert([
      { user_id: uid, role: 'user', content: message, created_at: new Date(now).toISOString() },
      { user_id: uid, role: 'coach', content: reply, created_at: new Date(now + 1).toISOString() },
    ])
    .select('id, role, content, created_at');
  if (saveError) return fail('offline', saveError);

  return Response.json({ messages: saved, remaining: DAILY_LIMIT - sentToday.length - 1 });
});
