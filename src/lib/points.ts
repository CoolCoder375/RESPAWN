// Respawn Points (RP): every quest is worth 1–3 RP.
// A day counts when the quests ticked are worth at least half the day's RP.
// Mirrors public.run_length() in supabase/migrations/0005_quests.sql.

export type DayScore = {
  earned: number;
  possible: number;
  /** RP needed for the day to count (half of possible, rounded up). */
  needed: number;
  counts: boolean;
};

export function scoreDay(quests: { rp: number; done: boolean }[]): DayScore {
  const possible = quests.reduce((sum, q) => sum + q.rp, 0);
  const earned = quests.reduce((sum, q) => sum + (q.done ? q.rp : 0), 0);
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
