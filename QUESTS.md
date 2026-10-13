# Quest system (Milestone 4.5)

Respawn gives you your daily quests. You can't add, edit, swap or delete them; you can only tick them.
The 50% RP rule and the reset to Day 1 stay exactly as they are.

## Flow

1. After onboarding (name, season start), you answer **20 tap-only questions** (~3 minutes).
2. The answers are saved once and can't be changed in the app, so they can't be used to make quests easier mid-season. Retaking will come with new seasons; until then an admin can delete the `questionnaires` row.
3. Each local day, the server generates that day's quests from your answers, your Day X and the weekday. The app only reads them and ticks them.

## The 20 questions

**Your day**

1. When do you usually wake up? — Before 6 · 6–7 · 7–8 · 8–9 · After 9
2. When do you usually fall asleep? — Before 10 · 10–11 · 11–12 · 12–1 · After 1
3. How do you feel when you wake up? — Fresh · OK · Tired · Exhausted
4. How many minutes a day can you give to quests? — 15 · 30 · 45 · 60+
5. Best time for exercise? — Morning · Afternoon · Evening · It varies

**Body**

6. How often do you exercise now? — Never · 1–2× a week · 3–4× · 5+
7. What movement do you enjoy? (pick any) — Walking · Running · Gym · Yoga · Home workout · Sport
8. How many push-ups can you do in a row? — 0 · A few on knees · 5–15 · 15+
9. Anything that limits hard exercise? — No · Knees or joints · Back · Other
10. Glasses of water a day? — Under 4 · 4–6 · 7–9 · 10+

**Food**

11. Junk food or sugary snacks? — Daily · A few times a week · Rarely
12. Do you eat a proper breakfast? — Never · Sometimes · Daily

**Mind**

13. Phone screen time a day, outside work? — Under 1h · 1–3h · 3–5h · 5h+
14. Do you check your phone within 15 minutes of waking? — Always · Sometimes · No
15. How often do you read books (not feeds)? — Never · Weekly · Daily
16. Prayer, meditation or quiet reflection? — Never · Sometimes · Daily
17. Do you plan your day? — Never · Sometimes · Daily

**Goals**

18. What do you want most from these 60 days? (pick up to 2) — Fitness · Better sleep · Focus · Calm mind · Eat better · Less phone · Discipline
19. What usually breaks your routine? — Comfort / laziness · Phone · Late nights · Work stress · Mood · No plan
20. How hard should Respawn push you? — Gentle · Steady · Hard

## How a day's quests are built

**How many:** this depends on Q4. 15 min gives 4 quests, 30 gives 5, 45 gives 6, and 60+ gives 7.

**Always included:**

| Slot     | Worth | Source                                                |
| -------- | ----- | ----------------------------------------------------- |
| Movement | 3 RP  | Main quest, rotates by weekday (below)                |
| Sleep    | 2 RP  | From Q1, Q2, Q3                                       |
| Mind     | 2 RP  | From Q13–Q17, aimed at the weakest answer             |
| Verse    | 1 RP  | "Read today's verse and its reflection" (Thought tab) |

**Choosing quests:** each candidate quest gets a score:

- the **need** your answers show (for example, junk food daily = 3), plus
- **+2** if it targets what breaks your routine (Q19), plus
- **+3** if it serves one of your goals (Q18). A quest that serves a goal is worth 3 RP; otherwise it's 2.

The **Sleep** slot goes to your biggest sleep need, whatever your goals. The **Mind** slot goes to the highest-scoring mind quest. **Extra slots** take the best quest from each area (sleep, mind, food, movement extras) before a second one from the same area, so one area can't fill the whole day.

**Difficulty:**

- The 60 days are split into four tiers: Days 1–15 Foundation, 16–30 Build, 31–45 Push, 46–60 Master.
- **The tier follows your Day X.** If your run resets, quests go back to Foundation. That's the "respawn".
- Q20 shifts where you start: Gentle holds the Foundation tier until Day 20, and Hard starts at Build.
- Q6 and Q8 cap how hard the movement quests get, and Q9 removes running and jumping.

**Movement rotation:**

- Weekly pattern: Mon strength · Tue cardio · Wed yoga/mobility · Thu strength · Fri cardio · Sat your favourite (Q7) · Sun active rest (2 RP).
- If Q6 is "Never", strength days become walks ("Easy start") for the first tier.
- Strength is a gym session if you picked Gym, otherwise home strength. Cardio is a run if you picked Running (and Q9 allows it), else sport, else a brisk walk.

## Quest library

Each quest has four values, one per tier (Foundation / Build / Push / Master).

**Movement**

- Brisk walk: 15 / 20 / 30 / 40 min
- Run: 10 / 15 / 20 / 25 min (skipped if Q9 is knees/joints)
- Home strength: 2 / 3 / 4 / 5 rounds of 10 squats, 5–10 push-ups and a 20 s plank
- Gym session: 30 / 40 / 45 / 60 min
- Yoga: 10 / 15 / 20 / 30 min
- Sport: 30 / 45 / 60 / 60 min
- Active rest (Sunday): 20 min stretch or easy walk
- Extras: stretch for 5 / 10 / 10 / 15 min; a 10 min walk after a meal

**Sleep**

- Lights out by your target. The target starts at the end of your Q2 range and moves 15 minutes earlier each tier, but never earlier than 8 hours before you wake.
- Up by your target. It starts at the middle of your Q1 range and moves 15 minutes earlier each tier, never before 5:30 am.
- No screens for 15 / 30 / 45 / 60 min before bed.

**Mind**

- No phone for the first 15 / 30 / 45 / 60 min after waking.
- Read 5 / 10 / 15 / 20 pages.
- Sit quietly: meditation, prayer or jap, 5 / 10 / 15 / 20 min.
- Plan tomorrow in 3 lines.
- Journal: 1 / 2 / 3 / 5 lines.
- Phone screen time under 3h / 2.5h / 2h / 1.5h (check it in your phone settings). It's 4h → 2.5h if you're on 5h+ now, and 2h → 1h if you're under 3h.

**Food and body care**

- Drink 6 / 7 / 8 / 8 glasses of water.
- No junk food or sugary snacks today.
- Eat a proper breakfast.
- Add one fruit or vegetable to every meal.

**Verse**

- Read today's verse and its reflection.

## What changes in the app and database

- **New tables:**
  - `questionnaires`: your answers, one row per season.
  - `quests`: each day's generated quests, with the title, category, RP and whether it's done.
  - Both are read-only for you (RLS). Ticking goes through a function that only lets you tick today's quests.
- **Generation:** `assign_quests()` works out "today" on the server from your profile's timezone, generates the quests once (with the rules in `build_quests()`), and returns the same quests after that.
- **Ticking:** `set_quest_done(quest, done)` only works on your own quests for today, with 10 minutes' grace after midnight.
- **The run:** `run_length()` scores a day from its quests. Days from before quests existed are still scored from the old daily tasks, so your run carries over. A day with neither (because you never opened the app) counts as a miss.
- **Today tab:** loses Add, Edit and Delete, and the One-off option goes away. It keeps the RP bar, the 50% marker, Day X and the streak.
- **Existing tasks:** your current hand-made tasks are archived. Their history stays in the database.
- **Duo:** your partner will see your quests, read-only (Milestone 5).
