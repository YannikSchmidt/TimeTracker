import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { usePalette } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  };
}

export default function TabsLayout() {
  const p = usePalette();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: p.primary }}>
      <Tabs.Screen name="index" options={{ title: 'Timer', tabBarIcon: icon('timer-outline') }} />
      <Tabs.Screen name="entries" options={{ title: 'Verlauf', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="articles" options={{ title: 'Artikel', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="stats" options={{ title: 'Statistik', tabBarIcon: icon('stats-chart-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Einstellungen', tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
