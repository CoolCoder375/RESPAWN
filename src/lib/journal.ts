// The daily journal quest (supabase/migrations/0006_journal.sql). Writing the entry ticks it.

/** Quest keys completed by writing the journal, not by ticking. */
const JOURNAL_KEYS = ['journal.write', 'mind.journal'];

export const JOURNAL_MAX_LENGTH = 4000;

export function isJournalQuest(quest: { quest_key: string }): boolean {
  return JOURNAL_KEYS.includes(quest.quest_key);
}

/** Lines the journal quest asks for at each tier (Foundation .. Master). Matches the SQL. */
export function linesNeeded(tier: number): number {
  return [1, 2, 3, 5][Math.min(Math.max(tier, 1), 4) - 1];
}

/** Non-blank lines, counted the same way as journal_line_count() on the server. */
export function lineCount(body: string): number {
  return body.split(/\r?\n/).filter((line) => line.trim() !== '').length;
}
