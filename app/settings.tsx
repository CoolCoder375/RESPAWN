import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProfileForm } from '@/components/ProfileForm';
import { Screen } from '@/components/Screen';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';

export default function Settings() {
  const { session } = useAuth();
  const { data: profile } = useProfile();

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in with your email.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <Screen edges={['bottom']}>
      <ProfileForm initial={profile} submitLabel="Save" onSaved={() => router.back()} />
      <View style={styles.account}>
        <AppText variant="label">Account</AppText>
        <AppText variant="muted">{session?.user.email}</AppText>
        <Button title="Sign out" variant="danger" onPress={confirmSignOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { gap: space.sm, marginTop: space.lg },
});
