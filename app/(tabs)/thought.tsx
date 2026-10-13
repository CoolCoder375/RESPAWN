import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { VerseCard, verseShareText } from '@/components/VerseCard';
import { verseForSeasonDay } from '@/data/verses';
import { useLocalDay } from '@/hooks/useLocalDay';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { useSavedThoughts } from '@/hooks/useSavedThoughts';
import { dayOfSeason } from '@/lib/dates';
import { colors, space } from '@/theme';

export default function ThoughtScreen() {
  const { data: profile } = useProfile();
  if (!profile) return null;
  return <Thought profile={profile} />;
}

function Thought({ profile }: { profile: Profile }) {
  const today = useLocalDay(profile.timezone);
  // Picked by calendar day, not the run's Day X, so a reset never repeats yesterday's verse.
  const verse = verseForSeasonDay(dayOfSeason(profile.season_start, today));
  const { saved, isSaved, toggle } = useSavedThoughts();
  const savedNow = isSaved(verse.id);

  function save() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggle(verse.id);
  }

  return (
    <Screen edges={[]}>
      <AppText variant="label">Verse of the day · {formatDay(today)}</AppText>
      <VerseCard verse={verse} full />

      <View style={styles.actions}>
        <View style={styles.row}>
          <Button
            title={savedNow ? 'Saved ✓' : 'Save'}
            variant={savedNow ? 'ghost' : 'primary'}
            onPress={save}
            style={styles.flex}
          />
          <Button
            title="Share"
            variant="ghost"
            onPress={() => Share.share({ message: verseShareText(verse) })}
            style={styles.flex}
          />
        </View>
        <Link href="/saved-thoughts" asChild>
          <Pressable accessibilityRole="link" style={styles.link}>
            <Ionicons name="bookmark-outline" size={18} color={colors.muted} />
            <AppText variant="muted">Saved verses ({saved.length})</AppText>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  actions: { gap: space.sm, marginTop: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  link: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
});
