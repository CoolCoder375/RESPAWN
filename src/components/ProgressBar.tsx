import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

type Props = {
  value: number;
  max: number;
  /** Optional threshold to mark on the track, e.g. RP needed for the day to count. */
  marker?: number;
};

export function ProgressBar({ value, max, marker }: Props) {
  const ratio = max === 0 ? 0 : Math.min(value / max, 1);
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: value }}
    >
      <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      {marker !== undefined && max > 0 ? (
        <View style={[styles.marker, { left: `${(marker / max) * 100}%` }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.text },
});
