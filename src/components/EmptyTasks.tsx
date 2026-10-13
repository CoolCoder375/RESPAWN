import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { NewTask } from '@/hooks/useTasks';
import { colors, fonts, radius, space } from '@/theme';
import { AppText } from './AppText';

const SUGGESTIONS: NewTask[] = [
  { title: 'Walk 20 min', kind: 'daily', category: 'body', priority: 3 },
  { title: 'Journal one line', kind: 'daily', category: 'mind', priority: 2 },
  { title: 'Lights out by 11:30', kind: 'daily', category: 'recovery', priority: 2 },
];

export function EmptyTasks({ onAdd }: { onAdd: (task: NewTask) => void }) {
  return (
    <View style={styles.card}>
      <AppText variant="title">Add your first task for today</AppText>
      <AppText variant="muted">Start small. Tap one to add it as a daily task:</AppText>
      {SUGGESTIONS.map((s) => (
        <Pressable
          key={s.title}
          accessibilityRole="button"
          accessibilityLabel={`Add ${s.title}`}
          onPress={() => onAdd(s)}
          style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={20} color={colors.accent} />
          <AppText style={styles.text}>{s.title}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  suggestion: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.7 },
  text: { fontFamily: fonts.bodyMedium },
});
