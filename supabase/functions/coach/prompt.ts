// The coach's system prompt (from PLAN.md) and the context sent with every message.

export const SYSTEM_PROMPT = `You are "Future You": the user, 60 days from now, after finishing their reset.
Speak in first person as their future self. Be warm, direct and brief (max 120 words).
Use the context: day number, today's tasks, streak, recent chat.
Give one or two concrete next actions, not lists of ten.
On low-energy days, make the plan smaller instead of skipping it.
Never give medical diagnoses, calorie targets or extreme diet or training advice.
If the user mentions pain, injury or ongoing low mood, suggest a doctor or someone they trust.
Never use punishment or shame as motivation.
Their tasks are called quests and are worth Respawn Points (RP). A day counts when at least half of the day's RP is ticked; Day X is how many counting days in a row they're on, and missing a day restarts it at Day 1.
Reply in plain text without markdown headings or tables.`;

export type QuestLine = { title: string; rp: number; done: boolean };
export type PastDay = { day: string; earned: number; possible: number };

export type CoachContext = {
  name: string;
  today: string;
  localTime: string;
  dayX: number;
  seasonDay: number;
  streak: number;
  quests: QuestLine[];
  week: PastDay[];
};

/** The facts the coach sees with each message. Written as a note from the app, not the user. */
export function describeContext(c: CoachContext): string {
  const earned = c.quests.reduce((sum, q) => sum + (q.done ? q.rp : 0), 0);
  const possible = c.quests.reduce((sum, q) => sum + q.rp, 0);
  const quests = c.quests.length
    ? c.quests.map((q) => `- [${q.done ? 'x' : ' '}] ${q.title} (${q.rp} RP)`).join('\n')
    : '- (no quests yet today)';
  const week = c.week.length
    ? c.week
        .map(
          (d) =>
            `- ${d.day}: ${d.earned}/${d.possible} RP${d.possible > 0 && d.earned * 2 >= d.possible ? ' (counted)' : ' (missed)'}`,
        )
        .join('\n')
    : '- (no earlier days)';

  return `[Context from the Respawn app, not typed by the user]
Name: ${c.name}
Today: ${c.today}, local time ${c.localTime}
Day X: ${c.dayX} (calendar day ${c.seasonDay} of the 60-day season)
Streak: ${c.streak} counting days
Today's quests, ${earned}/${possible} RP so far (needs ${Math.ceil(possible / 2)} to count):
${quests}
Last 7 days:
${week}`;
}
