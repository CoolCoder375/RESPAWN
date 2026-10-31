// Groups a day's quests into Morning / Anytime / Night clumps on the Today screen.
// Purely visual: the server doesn't know about these groups.

import { DAY_START_HOUR } from './dates';

export type QuestTime = 'morning' | 'anytime' | 'night';

export const QUEST_TIMES: QuestTime[] = ['morning', 'anytime', 'night'];

export const questTimeLabel: Record<QuestTime, string> = {
  morning: 'Morning',
  anytime: 'Anytime',
  night: 'Night',
};

/** Quest keys (supabase/migrations/0005_quests.sql, 0011_night_quests.sql) by time of day. */
const BY_KEY: Record<string, QuestTime> = {
  'sleep.up': 'morning',
  'sleep.lights_out': 'morning',
  'sleep.no_screens': 'morning',
  'mind.phone_morning': 'morning',
  'food.breakfast': 'morning',
  'verse.read': 'morning',
  'mind.plan': 'night',
  'mind.breathe': 'night',
  'mind.connect': 'night',
  'move.stretch': 'night',
  'move.walk_meal': 'night',
  'journal.write': 'night',
  'mind.journal': 'night',
};

/** Sleep quests from before 0011 are about tonight ("Lights out by 1:00 am"), not last night. */
const TONIGHT_SLEEP_KEYS = ['sleep.lights_out', 'sleep.no_screens'];

export function questTime(quest: { quest_key: string; title: string }): QuestTime {
  if (TONIGHT_SLEEP_KEYS.includes(quest.quest_key) && !quest.title.endsWith('last night')) {
    return 'night';
  }
  return BY_KEY[quest.quest_key] ?? 'anytime';
}

/** The clump that fits the hour (0–23): night from 7 pm until the day ends at 4 am. */
export function currentQuestTime(hour: number): QuestTime {
  if (hour < DAY_START_HOUR) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 19) return 'anytime';
  return 'night';
}

/** The local hour (0–23) in `timezone`. */
export function localHour(timezone: string, date: Date = new Date()): number {
  // hour12: false can print "24" at midnight on some engines, hence the % 24.
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(date);
  return parseInt(hour, 10) % 24;
}
