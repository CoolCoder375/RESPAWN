/** One verse of the day. Sources must be public domain; see DECISIONS.md. */
export type Verse = {
  /** Stable id, e.g. "gita-2.47". Saved verses refer to it. */
  id: string;
  /** e.g. "Bhagavad Gita", "Srimad Bhagavatam". */
  source: string;
  /** Book/chapter/verse as numbered in the Sanskrit source, e.g. "2.47". */
  citation: string;
  /** Devanagari, two half-lines separated by "\n". Null when not verified. */
  sanskrit: string | null;
  transliteration: string | null;
  /** Plain modern English, written for Respawn from the public-domain translation below. */
  translation: string;
  /** Public-domain translation the rendering is based on, e.g. "K. T. Telang (1882)". */
  basedOn: string;
  /** Two or three lines connecting the verse to the reset. */
  reflection: string;
};
