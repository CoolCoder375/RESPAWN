// Evening quest reminder: a local notification scheduled on the phone, so it works without
// Firebase or the server. Rescheduled each time today's quests change, with the real count.

import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { DAY_START_HOUR } from './dates';
import { scoreDay } from './points';

/** Local time of the reminder (24 h). */
export const REMINDER_HOUR = 20;

const CHANNEL = 'reminders';
const TODAY_ID = 'quest-reminder-today';
// Fallbacks for days the app isn't opened; replaced by the real count when it is.
const LATER_IDS = ['quest-reminder-1', 'quest-reminder-2'];

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Quest reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** The reminder time on the evening of the current day (which runs until 4 am) plus `daysAhead`. */
function reminderAt(daysAhead: number, now: Date): Date {
  const at = new Date(now.getTime() - DAY_START_HOUR * 60 * 60 * 1000);
  at.setDate(at.getDate() + daysAhead);
  at.setHours(REMINDER_HOUR, 0, 0, 0);
  return at;
}

function todayMessage(left: number, earned: number, needed: number, counts: boolean) {
  if (!counts) {
    return {
      title: `${needed - earned} RP to keep your run`,
      body: `${left} ${left === 1 ? 'quest' : 'quests'} left today. Finish enough before you sleep or it's back to Day 1.`,
    };
  }
  return {
    title: 'Today already counts',
    body: `${left} ${left === 1 ? 'quest' : 'quests'} left if you want the full day.`,
  };
}

async function schedule(identifier: string, date: Date, content: { title: string; body: string }) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { ...content, data: { url: '/' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
  });
}

async function syncReminders(quests: { rp: number; done_at: string | null }[]) {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  await ensureChannel();

  const now = new Date();
  const score = scoreDay(quests.map((q) => ({ rp: q.rp, done: q.done_at !== null })));
  const left = quests.filter((q) => q.done_at === null).length;

  await Notifications.cancelScheduledNotificationAsync(TODAY_ID);
  const tonight = reminderAt(0, now);
  if (left > 0 && tonight > now) {
    await schedule(TODAY_ID, tonight, todayMessage(left, score.earned, score.needed, score.counts));
  }

  for (const [i, id] of LATER_IDS.entries()) {
    await schedule(id, reminderAt(i + 1, now), {
      title: 'How are today’s quests going?',
      body: 'Open Respawn and tick what you’ve done before the day ends.',
    });
  }
}

/** Keeps the evening reminder in step with today's quests. */
export function useQuestReminders(quests: { rp: number; done_at: string | null }[] | undefined) {
  const key = quests?.map((q) => `${q.rp}:${q.done_at ? 1 : 0}`).join(',');
  useEffect(() => {
    if (!quests) return;
    syncReminders(quests).catch((error) => console.warn('Scheduling reminders failed', error));
    // `key` captures every change that matters; `quests` itself is a new array on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** A notification a few seconds from now, to check that this phone shows them. */
export async function sendTestNotification() {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Respawn notifications work', body: 'You’ll get a quest reminder at 8 pm.' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3,
      channelId: CHANNEL,
    },
  });
}
