import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { displayCheer, useDismissCheers, useUnseenCheers } from '@/hooks/useCheers';
import { colors, fonts, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

/** How long a cheer stays on screen before it fades and counts as seen. */
const SHOW_MS = 8000;

/** Unseen cheers from your partner, on top of the Today tab for 8 s, or until tapped. */
export function CheerBanner({ userId, partnerName }: { userId: string; partnerName?: string }) {
  const { data: cheers } = useUnseenCheers(userId);
  const { mutate: dismiss } = useDismissCheers(userId);
  const [opacity] = useState(() => new Animated.Value(1));
  const latestId = cheers?.[0]?.id;

  const close = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) dismiss();
      },
    );
  }, [opacity, dismiss]);

  // Restart the timer for each new cheer. Leaving the screen first keeps it for next time.
  useEffect(() => {
    if (!latestId) return;
    opacity.setValue(1);
    const timer = setTimeout(close, SHOW_MS);
    return () => clearTimeout(timer);
  }, [latestId, close, opacity]);

  if (!cheers?.length) return null;

  const latest = cheers[0];
  const more = cheers.length - 1;

  return (
    <Animated.View style={[styles.banner, { opacity }]} accessibilityLiveRegion="polite">
      <Ionicons name="megaphone" size={20} color={colors.onAccent} />
      <View style={styles.body}>
        <AppText style={styles.from}>{partnerName ?? 'Your partner'} says</AppText>
        <AppText style={styles.message}>
          {displayCheer(latest.message)}
          {more > 0 ? ` (+${more} more)` : ''}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={close}
        style={styles.close}
      >
        <Ionicons name="close" size={22} color={colors.onAccent} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  body: { flex: 1, paddingVertical: space.sm },
  from: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.onAccent },
  message: { fontFamily: fonts.displayMedium, fontSize: 17, color: colors.onAccent },
  close: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
});
