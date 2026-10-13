import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DayTask } from '@/hooks/useTasks';
import { categoryColor, categoryLabel, isCategory } from '@/lib/categories';
import { colors, fonts, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

type Props = {
  task: DayTask;
  onToggle?: () => void;
  onPress?: () => void;
};

/** A task with a tick box. Without `onToggle`/`onPress` it renders read-only (partner view). */
export function TaskRow({ task, onToggle, onPress }: Props) {
  const category = isCategory(task.category) ? task.category : null;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done, disabled: !onToggle }}
        accessibilityLabel={task.title}
        disabled={!onToggle}
        onPress={onToggle}
        hitSlop={4}
        style={styles.checkHit}
      >
        <View style={[styles.box, task.done && styles.boxDone]}>
          {task.done ? <Ionicons name="checkmark" size={18} color={colors.onAccent} /> : null}
        </View>
      </Pressable>
      <Pressable
        style={styles.body}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityHint={onPress ? 'Edit task' : undefined}
      >
        <AppText style={[styles.title, task.done && styles.titleDone]}>{task.title}</AppText>
        <View style={styles.meta}>
          <AppText style={[styles.tag, styles.rp]}>{task.priority} RP</AppText>
          {category ? (
            <AppText style={[styles.tag, { color: categoryColor[category] }]}>
              {categoryLabel[category]}
            </AppText>
          ) : null}
          {task.kind === 'once' ? <AppText style={styles.tag}>One-off</AppText> : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingRight: space.md,
    minHeight: 60,
  },
  checkHit: { width: touch + 8, minHeight: touch, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  body: { flex: 1, paddingVertical: space.sm + 4, gap: 2 },
  title: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text },
  titleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', gap: space.sm },
  tag: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted },
  rp: { color: colors.text },
});
