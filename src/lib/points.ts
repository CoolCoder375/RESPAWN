// Respawn Points (RP): a task's priority is what it's worth.
// A day counts when daily tasks worth at least half the day's possible RP are ticked.
// Mirrors public.run_length() in supabase/migrations/0004_respawn_points.sql.

export type Priority = 1 | 2 | 3;

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 3, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 1, label: 'Low' },
];

/** Short labels for pickers, e.g. "High · 3". */
export const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({
  value: p.value,
  label: `${p.value === 2 ? 'Med' : p.label} · ${p.value}`,
}));

export const DEFAULT_PRIORITY: Priority = 2;

export function asPriority(value: number): Priority {
  return value >= 3 ? 3 : value <= 1 ? 1 : 2;
}

export type DayScore = {
  earned: number;
  possible: number;
  /** RP needed for the day to count (half of possible, rounded up). */
  needed: number;
  counts: boolean;
};

export function scoreDay(dailyTasks: { priority: number; done: boolean }[]): DayScore {
  const possible = dailyTasks.reduce((sum, t) => sum + t.priority, 0);
  const earned = dailyTasks.reduce((sum, t) => sum + (t.done ? t.priority : 0), 0);
  return {
    earned,
    possible,
    needed: Math.ceil(possible / 2),
    counts: possible > 0 && earned * 2 >= possible,
  };
}

/**
 * Day X and streak from the run through yesterday (server) and today's live score.
 * Day X is the day you're on, so it already includes today; the streak only counts
 * today once it's secured.
 */
export function runStatus(runThroughYesterday: number, todayCounts: boolean) {
  return {
    day: runThroughYesterday + 1,
    streak: runThroughYesterday + (todayCounts ? 1 : 0),
  };
}
