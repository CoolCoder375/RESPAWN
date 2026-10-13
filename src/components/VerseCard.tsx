import { StyleSheet, View } from 'react-native';

import type { Verse } from '@/data/verses.types';
import { colors, fonts, space } from '@/theme';
import { AppText } from './AppText';

export function verseShareText(verse: Verse): string {
  return [verse.sanskrit, `“${verse.translation}”`, `— ${verse.source} ${verse.citation}`]
    .filter(Boolean)
    .join('\n\n');
}

/** Sanskrit, transliteration, plain English and citation. `full` adds the reflection. */
export function VerseCard({ verse, full = false }: { verse: Verse; full?: boolean }) {
  return (
    <View style={styles.wrap}>
      <AppText variant="label" color={colors.accent}>
        {verse.source} {verse.citation}
      </AppText>
      {verse.sanskrit ? (
        // System font: the app fonts have no Devanagari glyphs.
        <AppText style={styles.sanskrit}>{verse.sanskrit}</AppText>
      ) : null}
      {full && verse.transliteration ? (
        <AppText style={styles.transliteration}>{verse.transliteration}</AppText>
      ) : null}
      <AppText style={full ? styles.translation : styles.translationSmall}>
        {verse.translation}
      </AppText>
      {full ? (
        <>
          <AppText style={styles.basedOn}>Rendering based on {verse.basedOn}</AppText>
          <View style={styles.reflection}>
            <AppText variant="label">For today</AppText>
            <AppText>{verse.reflection}</AppText>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  sanskrit: { fontSize: 19, lineHeight: 30, color: colors.text },
  transliteration: {
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  translation: {
    fontFamily: fonts.displayMedium,
    fontSize: 21,
    lineHeight: 30,
    color: colors.text,
  },
  translationSmall: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23 },
  basedOn: { fontSize: 12, color: colors.muted },
  reflection: {
    gap: space.xs,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
