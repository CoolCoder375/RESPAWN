import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { displayCheer, useDismissCheers, useUnseenCheers } from '@/hooks/useCheers';
import { colors, fonts, radius, space, touch } from '@/theme';
import { AppText } from './AppText';

/** Unseen cheers from your partner, on top of the Today tab until dismissed. */
export function CheerBanner({ userId, partnerName }: { userId: string; partnerName?: string }) {
  const { data: cheers } = useUnseenCheers(userId);
  const dismiss = useDismissCheers(userId);
  if (!cheers?.length) return null;

  const latest = cheers[0];
  const more = cheers.length - 1;

  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
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
        onPress={() => dismiss.mutate()}
        style={styles.close}
      >
        <Ionicons name="close" size={22} color={colors.onAccent} />
      </Pressable>
    </View>
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
