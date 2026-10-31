import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Quest } from '@/hooks/useQuests';
import { questTimeLabel, type QuestTime } from '@/lib/questTimes';
import { colors, fonts, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

const ICONS: Record<QuestTime, ComponentProps<typeof Ionicons>['name']> = {
  morning: 'partly-sunny-outline',
  anytime: 'sunny-outline',
  night: 'moon-outline',
};

type Props = {
  time: QuestTime;
  quests: Quest[];
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** A foldable clump of quests: header with progress, rows underneath when open. */
export function QuestGroup({ time, quests, open, onToggle, children }: Props) {
  const done = quests.filter((q) => q.done_at).length;
  const earned = quests.reduce((sum, q) => sum + (q.done_at ? q.rp : 0), 0);
  const possible = quests.reduce((sum, q) => sum + q.rp, 0);
  const complete = done === quests.length;
  const label = questTimeLabel[time];

  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${done} of ${quests.length} done, ${earned} of ${possible} RP`}
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <Ionicons
          name={complete ? 'checkmark-circle' : ICONS[time]}
          size={22}
          color={complete ? colors.accent : colors.text}
        />
        <AppText style={styles.title}>{label}</AppText>
        <AppText style={[styles.count, complete && styles.countDone]}>
          {done}/{quests.length} · {earned}/{possible} RP
        </AppText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>
      {open ? <View style={styles.rows}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touch,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.7 },
  title: { flex: 1, fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  count: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  countDone: { color: colors.accent },
  rows: { gap: space.sm },
});
