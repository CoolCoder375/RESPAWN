import { GITA } from './verses/gita';
import { PURANAS } from './verses/puranas';
import type { Verse } from './verses.types';

export type { Verse } from './verses.types';

const byId = new Map([...GITA, ...PURANAS].map((v) => [v.id, v]));

/**
 * The season's order, Day 1 first. It moves from getting up and starting, through
 * habits, the mind and desire, steadiness and character, to finishing and keeping it.
 */
const SEASON_ORDER = [
  'gita-2.3',
  'matsya-221.11-12',
  'gita-3.8',
  'garuda-1.109.46',
  'gita-2.40',
  'bhagavatam-7.6.5',
  'gita-6.5',
  'garuda-1.113.7-8',
  'gita-2.47',
  'vishnu-3.12.17',
  'gita-6.16',
  'gita-6.17',
  'bhagavatam-8.20.4',
  'gita-2.14',
  'vishnu-4.10.23',
  'gita-2.62',
  'gita-2.63',
  'garuda-1.111.24',
  'gita-6.6',
  'markandeya-39.9',
  'gita-6.26',
  'vishnu-6.7.28',
  'gita-6.35',
  'garuda-1.108.26',
  'gita-3.21',
  'markandeya-37.23',
  'gita-2.48',
  'bhagavatam-7.15.20',
  'gita-6.19',
  'gita-6.40',
  'garuda-1.113.62-63',
  'gita-2.50',
  'vishnu-1.11.23-24',
  'gita-3.19',
  'bhagavatam-8.19.21',
  'gita-2.70',
  'garuda-1.113.9',
  'gita-17.15',
  'vishnu-3.12.43-44',
  'gita-17.16',
  'bhagavatam-2.2.4',
  'gita-2.56',
  'garuda-1.113.42',
  'vishnu-3.12.23',
  'gita-12.13',
  'vishnu-1.17.80-81',
  'gita-16.21',
  'garuda-1.113.38',
  'gita-16.1',
  'markandeya-38.6',
  'gita-4.39',
  'gita-5.10',
  'bhagavatam-2.3.17',
  'gita-18.26',
  'matsya-221.2-3',
  'gita-3.35',
  'bhagavatam-7.6.1',
  'gita-18.37',
  'gita-18.66',
  'gita-18.78',
];

export const VERSES: readonly Verse[] = SEASON_ORDER.map((id) => {
  const verse = byId.get(id);
  if (!verse) throw new Error(`Unknown verse id in SEASON_ORDER: ${id}`);
  return verse;
});

export function verseById(id: string): Verse | undefined {
  return byId.get(id);
}

/** Calendar day of the season → verse; before Day 1 shows the first, after Day 60 it cycles. */
export function verseForSeasonDay(seasonDay: number): Verse {
  const index = seasonDay < 1 ? 0 : (seasonDay - 1) % VERSES.length;
  return VERSES[index];
}
