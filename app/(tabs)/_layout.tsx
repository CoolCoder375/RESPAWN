import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type ColorValue } from 'react-native';

import { colors, fonts, space, touch } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  }
  return TabIcon;
}

function SettingsButton() {
  return (
    <Link href="/settings" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={8}
        style={styles.settings}
      >
        <Ionicons name="settings-outline" size={22} color={colors.text} />
      </Pressable>
    </Link>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.displayMedium, fontSize: 18 },
        headerRight: () => <SettingsButton />,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: tabIcon('checkbox-outline') }}
      />
      <Tabs.Screen name="duo" options={{ title: 'Duo', tabBarIcon: tabIcon('people-outline') }} />
      <Tabs.Screen
        name="coach"
        options={{ title: 'Coach', tabBarIcon: tabIcon('chatbubble-ellipses-outline') }}
      />
      <Tabs.Screen
        name="thought"
        options={{ title: 'Thought', tabBarIcon: tabIcon('bulb-outline') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  settings: {
    minWidth: touch,
    minHeight: touch,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
  },
});
