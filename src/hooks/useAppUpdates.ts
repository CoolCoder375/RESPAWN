import { useQuery } from '@tanstack/react-query';
import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking } from 'react-native';

import { supabase } from '@/lib/supabase';

/** The newest APK (supabase/migrations/0009_app_releases.sql). */
function useLatestRelease(enabled: boolean) {
  return useQuery({
    queryKey: ['app-release'],
    enabled,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_releases')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Keeps the app current, with a popup for each kind of update:
 *   - JavaScript update (eas update): downloaded in the background, then "Restart to update".
 *   - New APK (native change): "Download" opens the APK link from app_releases.
 * Off in development and Expo Go, where expo-updates isn't running.
 */
export function useAppUpdates(signedIn: boolean) {
  const enabled = Updates.isEnabled && signedIn;
  const release = useLatestRelease(enabled);
  const { isUpdatePending } = Updates.useUpdates();
  const asked = useRef({ apk: false, restart: false });

  // Look for a JavaScript update whenever the app comes back to the foreground.
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or the update server is down: try again next time.
      }
    });
    return () => subscription.remove();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isUpdatePending || asked.current.restart) return;
    asked.current.restart = true;
    Alert.alert(
      'Respawn updated',
      'Restart now to use the new version. Your data stays as it is.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart', onPress: () => Updates.reloadAsync() },
      ],
    );
  }, [enabled, isUpdatePending]);

  const latest = release.data;
  useEffect(() => {
    if (!enabled || !latest || asked.current.apk) return;
    if (latest.runtime_version === Updates.runtimeVersion) return;
    asked.current.apk = true;
    Alert.alert(
      'New version of Respawn',
      [
        latest.notes,
        'Download it and install it over this one. You stay signed in and keep your data.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Download', onPress: () => Linking.openURL(latest.apk_url) },
      ],
    );
  }, [enabled, latest]);
}
