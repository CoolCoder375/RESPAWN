import { router } from 'expo-router';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProfileForm } from '@/components/ProfileForm';
import { Screen } from '@/components/Screen';
import { useProfile, type Profile } from '@/hooks/useProfile';
import { usePartner, useUnpair } from '@/hooks/usePartner';
import { useAuth } from '@/lib/auth';
import { registerForPush, unregisterPush, usePushStatus } from '@/lib/notifications';
import { REMINDER_HOUR, sendTestNotification } from '@/lib/reminders';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';

export default function Settings() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  if (!profile) return null;
  return <SettingsForm profile={profile} email={session?.user.email} />;
}

function SettingsForm({ profile, email }: { profile: Profile; email?: string }) {
  const partner = usePartner(profile);
  const unpair = useUnpair(profile.id);

  function confirmUnpair() {
    const name = partner.data?.display_name ?? 'your partner';
    Alert.alert(
      `Leave your duo with ${name}?`,
      'You’ll stop seeing each other’s quests and cheers. Your history is kept, and you can pair again with a new code.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpair', style: 'destructive', onPress: () => unpair.mutate() },
      ],
    );
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in with your email.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await unregisterPush().catch(() => {});
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  return (
    <Screen edges={['bottom']}>
      <ProfileForm initial={profile} submitLabel="Save" onSaved={() => router.back()} />
      {profile.pair_id ? (
        <View style={styles.section}>
          <AppText variant="label">Duo</AppText>
          <AppText variant="muted">Paired with {partner.data?.display_name ?? '…'}</AppText>
          {unpair.isError ? <AppText variant="muted">{unpair.error.message}</AppText> : null}
          <Button
            title="Unpair"
            variant="danger"
            loading={unpair.isPending}
            onPress={confirmUnpair}
          />
        </View>
      ) : null}
      <NotificationsSection />
      <View style={styles.section}>
        <AppText variant="label">Account</AppText>
        <AppText variant="muted">{email}</AppText>
        <Button title="Sign out" variant="danger" onPress={confirmSignOut} />
      </View>
    </Screen>
  );
}

function NotificationsSection() {
  const push = usePushStatus();
  const hour = REMINDER_HOUR > 12 ? `${REMINDER_HOUR - 12} pm` : `${REMINDER_HOUR} am`;

  async function test() {
    try {
      await sendTestNotification();
    } catch (error) {
      Alert.alert('Couldn’t send a test', error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <View style={styles.section}>
      <AppText variant="label">Notifications</AppText>
      {push.state === 'checking' ? <AppText variant="muted">Checking…</AppText> : null}
      {push.state === 'on' ? (
        <>
          <AppText variant="muted">
            On. You get a reminder at {hour} if quests are left, and a notification when your
            partner cheers you.
          </AppText>
          <Button title="Send a test notification" variant="ghost" onPress={test} />
        </>
      ) : null}
      {push.state === 'blocked' ? (
        <>
          <AppText variant="muted">
            Notifications are turned off for Respawn. Turn them on in your phone’s settings, then
            come back.
          </AppText>
          <Button title="Open phone settings" variant="ghost" onPress={() => Linking.openSettings()} />
          <Button title="Check again" variant="ghost" onPress={registerForPush} />
        </>
      ) : null}
      {push.state === 'error' ? (
        <>
          <AppText variant="muted">
            Reminders work, but cheers can’t reach this phone yet. Error: {push.message}
          </AppText>
          <Button title="Try again" variant="ghost" onPress={registerForPush} />
          <Button title="Send a test notification" variant="ghost" onPress={test} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginTop: space.lg },
});
