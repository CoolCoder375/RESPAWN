// Push notifications: register this phone's Expo push token so cheers reach it while the app
// is closed (supabase/functions/notify sends them). Failing to register is never fatal.

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// While the app is open the cheer banner already shows, so keep pushes in the tray only.
// Local notifications (reminders, the Settings test) still pop up.
Notifications.setNotificationHandler({
  handleNotification: async ({ request: { trigger } }) => {
    const isPush = trigger !== null && 'type' in trigger && trigger.type === 'push';
    return {
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: !isPush,
      shouldShowList: true,
    };
  },
});

/** Whether this phone gets cheers, shown in Settings so a failure isn't silent. */
export type PushStatus =
  | { state: 'checking' }
  | { state: 'on' }
  | { state: 'blocked' }
  | { state: 'error'; message: string };

let pushStatus: PushStatus = { state: 'checking' };
const listeners = new Set<() => void>();

function setStatus(next: PushStatus) {
  pushStatus = next;
  listeners.forEach((listener) => listener());
}

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pushStatus,
  );
}

let registeredToken: string | null = null;

/** Asks for permission and registers this phone for pushes. Never throws. */
export async function registerForPush(): Promise<void> {
  setStatus({ state: 'checking' });
  try {
    setStatus(await register());
  } catch (error) {
    console.warn('Push registration failed', error);
    setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

async function register(): Promise<PushStatus> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('cheers', {
      name: 'Cheers from your partner',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return { state: 'blocked' };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.rpc('register_push_token', { token });
  if (error) throw error;
  registeredToken = token;
  return { state: 'on' };
}

/** Stop pushes to this phone. Call before signing out. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  await supabase.rpc('unregister_push_token', { token: registeredToken });
  registeredToken = null;
}

/** Registers for pushes once signed in, and opens the right screen when a push is tapped. */
export function usePushNotifications(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    registerForPush();
  }, [signedIn]);

  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (signedIn && typeof url === 'string') {
      router.navigate(url as never);
      Notifications.clearLastNotificationResponse();
    }
  }, [response, signedIn]);
}
