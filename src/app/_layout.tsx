import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { StorageRoot } from '../data/StorageRoot';
import { setupPwa } from '../lib/pwa';
import { setupUpdates } from '../lib/updates';

export default function RootLayout() {
  const scheme = useColorScheme();
  useEffect(() => {
    setupPwa();
    setupUpdates();
  }, []);
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StorageRoot>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/[id]" options={{ presentation: 'modal', title: 'Arbeitsabschnitt' }} />
          <Stack.Screen name="start" options={{ presentation: 'modal', title: 'Neuer Auftrag' }} />
          <Stack.Screen name="job/[id]" options={{ title: 'Auftrag' }} />
          <Stack.Screen name="rework-reason/[id]" options={{ presentation: 'modal', title: 'Nacharbeit beenden' }} />
          <Stack.Screen name="connect" options={{ presentation: 'modal', title: 'Team-Sync' }} />
          <Stack.Screen name="article/[id]" options={{ presentation: 'modal', title: 'Artikel' }} />
          <Stack.Screen name="invite" options={{ presentation: 'modal', title: 'Kollegen einladen' }} />
          <Stack.Screen name="join" options={{ title: 'Einladung' }} />
          <Stack.Screen name="flows" options={{ title: 'Abläufe' }} />
          <Stack.Screen name="feedback" options={{ presentation: 'modal', title: 'Verbesserung vorschlagen' }} />
        </Stack>
      </StorageRoot>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
