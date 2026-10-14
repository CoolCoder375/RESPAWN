import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import type { dayStatus } from '@/hooks/useQuests';
import { SEASON_LENGTH } from '@/lib/dates';
import { colors, fonts, radius, space } from '@/theme';
import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';

type Props = {
  label: string;
  name: string;
  status: ReturnType<typeof dayStatus> | null;
  total: number;
};

/** One side of the Duo header: Day X, streak and today's RP. */
export function PlayerCard({ label, name, status, total }: Props) {
  return (
    <View style={styles.card}>
      <AppText variant="label">{label}</AppText>
      <AppText variant="title" numberOfLines={1}>
        {name}
      </AppText>
      {status ? (
        <>
          <AppText style={styles.day}>{dayLabel(status.seasonDay, status.day)}</AppText>
          <View style={styles.row}>
            <Ionicons name="flame" size={16} color={colors.focus} />
            <AppText style={styles.stat}>{status.run.streak} streak</AppText>
          </View>
          <AppText style={styles.stat}>
            {status.score.earned} / {status.score.possible} RP
          </AppText>
          <ProgressBar
            value={status.score.earned}
            max={status.score.possible}
            marker={status.score.needed}
          />
          <AppText variant="muted">
            {status.done} / {total} quests{status.score.counts ? ' ✓' : ''}
          </AppText>
        </>
      ) : (
        <AppText variant="muted">No quests yet today</AppText>
      )}
    </View>
  );
}

function dayLabel(seasonDay: number, day: number) {
  if (seasonDay < 1) return `Starts in ${1 - seasonDay}d`;
  if (day > SEASON_LENGTH) return 'Season done';
  return `Day ${day} / ${SEASON_LENGTH}`;
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: space.xs + 2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  day: { fontFamily: fonts.displayMedium, fontSize: 16, color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stat: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
});
