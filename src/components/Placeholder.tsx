import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/theme';
import { AppText } from './AppText';

/** Stand-in for a tab that a later milestone fills in. */
export function Placeholder({ title, milestone }: { title: string; milestone: number }) {
  return (
    <View style={styles.card}>
      <AppText variant="title">{title}</AppText>
      <AppText variant="muted">Coming in Milestone {milestone}.</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.sm,
  },
});
