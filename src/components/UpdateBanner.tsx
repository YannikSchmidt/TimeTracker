import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAppUpdate } from '../lib/updates';
import { radius, spacing, usePalette } from '../theme';

/** Hinweis auf eine neue Version (wird sonst automatisch im Hintergrund geladen). */
export function UpdateBanner() {
  const p = usePalette();
  const update = useAppUpdate();
  if (!update.available) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Neue Version laden"
      onPress={update.apply}
      style={({ pressed }) => [styles.banner, { backgroundColor: p.primary + '18', borderColor: p.primary, opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name="sparkles-outline" size={18} color={p.primary} />
      <Text style={{ color: p.text, flex: 1 }}>Neue Version verfügbar</Text>
      <Text style={{ color: p.primary, fontWeight: '700' }}>Jetzt aktualisieren</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
