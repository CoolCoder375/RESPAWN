// The 20 questions that shape your quests (QUESTS.md).
// Ids and option values must match submit_questionnaire() in supabase/migrations/0005_quests.sql.

export type Option = { value: string; label: string };

export type Question = {
  id: string;
  section: string;
  text: string;
  options: Option[];
  /** Multiple choice, up to this many answers. */
  maxPicks?: number;
};

export type Answers = Record<string, string | string[]>;

const opts = (...pairs: [string, string][]): Option[] =>
  pairs.map(([value, label]) => ({ value, label }));

export const QUESTIONS: Question[] = [
  {
    id: 'wake',
    section: 'Your day',
    text: 'When do you usually wake up?',
    options: opts(
      ['before6', 'Before 6'],
      ['6-7', '6 – 7'],
      ['7-8', '7 – 8'],
      ['8-9', '8 – 9'],
      ['after9', 'After 9'],
    ),
  },
  {
    id: 'sleep',
    section: 'Your day',
    text: 'When do you usually fall asleep?',
    options: opts(
      ['before10', 'Before 10 pm'],
      ['10-11', '10 – 11 pm'],
      ['11-12', '11 pm – midnight'],
      ['12-1', 'Midnight – 1 am'],
      ['after1', 'After 1 am'],
    ),
  },
  {
    id: 'morning_feel',
    section: 'Your day',
    text: 'How do you feel when you wake up?',
    options: opts(['fresh', 'Fresh'], ['ok', 'OK'], ['tired', 'Tired'], ['exhausted', 'Exhausted']),
  },
  {
    id: 'minutes',
    section: 'Your day',
    text: 'How many minutes a day can you give to quests?',
    options: opts(['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '60 min or more']),
  },
  {
    id: 'exercise_time',
    section: 'Your day',
    text: 'Best time for exercise?',
    options: opts(
      ['morning', 'Morning'],
      ['afternoon', 'Afternoon'],
      ['evening', 'Evening'],
      ['varies', 'It varies'],
    ),
  },
  {
    id: 'exercise_freq',
    section: 'Body',
    text: 'How often do you exercise now?',
    options: opts(
      ['never', 'Never'],
      ['1-2', '1–2 times a week'],
      ['3-4', '3–4 times a week'],
      ['5plus', '5 or more'],
    ),
  },
  {
    id: 'enjoy',
    section: 'Body',
    text: 'What movement do you enjoy?',
    maxPicks: 6,
    options: opts(
      ['walking', 'Walking'],
      ['running', 'Running'],
      ['gym', 'Gym'],
      ['yoga', 'Yoga'],
      ['home', 'Home workout'],
      ['sport', 'Sport'],
    ),
  },
  {
    id: 'pushups',
    section: 'Body',
    text: 'How many push-ups can you do in a row?',
    options: opts(
      ['0', 'None yet'],
      ['knees', 'A few, on my knees'],
      ['5-15', '5 – 15'],
      ['15plus', 'More than 15'],
    ),
  },
  {
    id: 'limits',
    section: 'Body',
    text: 'Anything that limits hard exercise?',
    options: opts(
      ['none', 'No'],
      ['joints', 'Knees or joints'],
      ['back', 'Back'],
      ['other', 'Other'],
    ),
  },
  {
    id: 'water',
    section: 'Body',
    text: 'How many glasses of water a day?',
    options: opts(['lt4', 'Under 4'], ['4-6', '4 – 6'], ['7-9', '7 – 9'], ['10plus', '10 or more']),
  },
  {
    id: 'junk',
    section: 'Food',
    text: 'Junk food or sugary snacks?',
    options: opts(['daily', 'Daily'], ['weekly', 'A few times a week'], ['rarely', 'Rarely']),
  },
  {
    id: 'breakfast',
    section: 'Food',
    text: 'Do you eat a proper breakfast?',
    options: opts(['never', 'Never'], ['sometimes', 'Sometimes'], ['daily', 'Daily']),
  },
  {
    id: 'screen',
    section: 'Mind',
    text: 'Phone screen time a day, outside work?',
    options: opts(
      ['lt1', 'Under 1 hour'],
      ['1-3', '1 – 3 hours'],
      ['3-5', '3 – 5 hours'],
      ['5plus', '5 hours or more'],
    ),
  },
  {
    id: 'phone_morning',
    section: 'Mind',
    text: 'Do you check your phone within 15 minutes of waking?',
    options: opts(['always', 'Always'], ['sometimes', 'Sometimes'], ['no', 'No']),
  },
  {
    id: 'reading',
    section: 'Mind',
    text: 'How often do you read books (not feeds)?',
    options: opts(['never', 'Never'], ['weekly', 'Weekly'], ['daily', 'Daily']),
  },
  {
    id: 'reflection',
    section: 'Mind',
    text: 'Prayer, meditation or quiet reflection?',
    options: opts(['never', 'Never'], ['sometimes', 'Sometimes'], ['daily', 'Daily']),
  },
  {
    id: 'planning',
    section: 'Mind',
    text: 'Do you plan your day?',
    options: opts(['never', 'Never'], ['sometimes', 'Sometimes'], ['daily', 'Daily']),
  },
  {
    id: 'goals',
    section: 'Goals',
    text: 'What do you want most from these 60 days?',
    maxPicks: 2,
    options: opts(
      ['fitness', 'Fitness'],
      ['sleep', 'Better sleep'],
      ['focus', 'Focus'],
      ['calm', 'Calm mind'],
      ['food', 'Eat better'],
      ['phone', 'Less phone'],
      ['discipline', 'Discipline'],
    ),
  },
  {
    id: 'breaker',
    section: 'Goals',
    text: 'What usually breaks your routine?',
    options: opts(
      ['comfort', 'Comfort, laziness'],
      ['phone', 'My phone'],
      ['late', 'Late nights'],
      ['stress', 'Work stress'],
      ['mood', 'Mood'],
      ['noplan', 'No plan'],
    ),
  },
  {
    id: 'intensity',
    section: 'Goals',
    text: 'How hard should Respawn push you?',
    options: opts(['gentle', 'Gentle'], ['steady', 'Steady'], ['hard', 'Hard']),
  },
];

export function isAnswered(question: Question, answer: Answers[string] | undefined): boolean {
  if (question.maxPicks) return Array.isArray(answer) && answer.length > 0;
  return typeof answer === 'string';
}
