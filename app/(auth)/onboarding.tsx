import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProfileForm } from '@/components/ProfileForm';
import { Screen } from '@/components/Screen';
import { SEASON_LENGTH } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';

export default function Onboarding() {
  return (
    <Screen>
      <View style={styles.hero}>
        <AppText variant="display">Set up your season</AppText>
        <AppText variant="muted">
          {SEASON_LENGTH} days starts on the date you pick. You can change it later in Settings.
        </AppText>
      </View>
      {/* Saving the profile flips the auth gate, which routes to the questionnaire. */}
      <ProfileForm submitLabel="Next: 20 quick questions" />
      <Button
        title="Use a different email"
        variant="ghost"
        onPress={() => supabase.auth.signOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.xl, gap: space.sm },
});
