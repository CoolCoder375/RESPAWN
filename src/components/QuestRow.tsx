import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Quest } from '@/hooks/useQuests';
import { categoryColor, categoryLabel, isCategory } from '@/lib/categories';
import { colors, fonts, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

type Props = {
  quest: Quest;
  /** Without it the row is read-only (partner view). */
  onToggle?: () => void;
  /** Instead of ticking, the row opens the screen that completes the quest (the journal). */
  onOpen?: () => void;
};

/** A quest with a tick box. The whole row ticks, or opens `onOpen`. */
export function QuestRow({ quest, onToggle, onOpen }: Props) {
  const onPress = onOpen ?? onToggle;
  const done = !!quest.done_at;
  const category = isCategory(quest.category) ? quest.category : null;

  return (
    <Pressable
      accessibilityRole={onOpen ? 'button' : 'checkbox'}
      accessibilityState={onOpen ? { disabled: false } : { checked: done, disabled: !onToggle }}
      accessibilityLabel={`${quest.title}, ${quest.rp} RP${onOpen && done ? ', done' : ''}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.checkHit}>
        <View style={[styles.box, done && styles.boxDone]}>
          {done ? <Ionicons name="checkmark" size={18} color={colors.onAccent} /> : null}
        </View>
      </View>
      <View style={styles.body}>
        <AppText style={[styles.title, done && styles.titleDone]}>{quest.title}</AppText>
        {quest.detail ? <AppText style={styles.detail}>{quest.detail}</AppText> : null}
        <View style={styles.meta}>
          <AppText style={[styles.tag, styles.rp]}>{quest.rp} RP</AppText>
          {category ? (
            <AppText style={[styles.tag, { color: categoryColor[category] }]}>
              {categoryLabel[category]}
            </AppText>
          ) : null}
        </View>
      </View>
      {onOpen ? <Ionicons name="chevron-forward" size={20} color={colors.muted} /> : null}
    </Pressable>
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
  pressed: { opacity: 0.8 },
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
  detail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  meta: { flexDirection: 'row', gap: space.sm },
  tag: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted },
  rp: { color: colors.text },
});
