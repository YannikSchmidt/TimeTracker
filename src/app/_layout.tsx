import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { StorageRoot } from '../data/StorageRoot';

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StorageRoot>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/[id]" options={{ presentation: 'modal', title: 'Eintrag' }} />
        </Stack>
      </StorageRoot>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
