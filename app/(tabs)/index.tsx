import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Placeholder } from '@/components/Placeholder';
import { Screen } from '@/components/Screen';
import { useProfile } from '@/hooks/useProfile';
import { dayOfSeason, localDay, SEASON_LENGTH } from '@/lib/dates';
import { colors, space } from '@/theme';

export default function Today() {
  const { data: profile } = useProfile();
  if (!profile) return null;

  const day = dayOfSeason(profile.season_start, localDay(profile.timezone));

  return (
    <Screen edges={[]}>
      <View style={styles.header}>
        <AppText variant="label">Hey {profile.display_name}</AppText>
        {day < 1 ? (
          <AppText variant="display">
            Starts in{' '}
            <AppText variant="display" color={colors.accent}>
              {1 - day}
            </AppText>{' '}
            {1 - day === 1 ? 'day' : 'days'}
          </AppText>
        ) : (
          <AppText variant="display">
            Day{' '}
            <AppText variant="display" color={colors.accent}>
              {day}
            </AppText>{' '}
            of {SEASON_LENGTH}
          </AppText>
        )}
      </View>
      <Placeholder title="Your tasks" milestone={3} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs },
});
