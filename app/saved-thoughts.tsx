import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { VerseCard, verseShareText } from '@/components/VerseCard';
import { verseById } from '@/data/verses';
import { useSavedThoughts } from '@/hooks/useSavedThoughts';
import { colors, radius, space, touch } from '@/theme';

export default function SavedVerses() {
  const { saved, toggle } = useSavedThoughts();
  const verses = saved.map((s) => verseById(s.id)).filter((v) => v !== undefined);

  return (
    <Screen edges={['bottom']}>
      {verses.length === 0 ? (
        <AppText variant="muted">
          Nothing saved yet. Tap Save on the Thought tab to keep a verse here.
        </AppText>
      ) : (
        verses.map((verse) => (
          <View key={verse.id} style={styles.card}>
            <VerseCard verse={verse} />
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share"
                onPress={() => Share.share({ message: verseShareText(verse) })}
                style={styles.icon}
              >
                <Ionicons name="share-outline" size={20} color={colors.muted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove from saved"
                onPress={() => toggle(verse.id)}
                style={styles.icon}
              >
                <Ionicons name="bookmark" size={20} color={colors.accent} />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  icon: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
});
