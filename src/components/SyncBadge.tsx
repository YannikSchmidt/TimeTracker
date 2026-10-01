import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTeam } from '../sync/TeamContext';
import { radius, spacing, usePalette } from '../theme';
import { Button, Card } from './ui';

/** Kleine Statuszeile des Team-Syncs; Tippen gleicht sofort ab. */
export function SyncBadge() {
  const p = usePalette();
  const team = useTeam();
  if (!team.available || !team.connected) return null;
  const { state, lastSync, error } = team.status;
  const color = state === 'error' ? p.danger : p.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Jetzt synchronisieren"
      onPress={team.syncNow}
      style={styles.badge}
    >
      {state === 'syncing' ? (
        <ActivityIndicator size="small" color={p.muted} />
      ) : (
        <Ionicons name={state === 'error' ? 'cloud-offline-outline' : 'cloud-done-outline'} size={16} color={color} />
      )}
      <Text style={{ color, fontSize: 12, flexShrink: 1 }} numberOfLines={2}>
        {state === 'error'
          ? error
          : state === 'syncing'
            ? 'Synchronisiere …'
            : lastSync
              ? `Synchronisiert ${format(lastSync, 'HH:mm')} · ${team.login}`
              : `Verbunden als ${team.login}`}
      </Text>
    </Pressable>
  );
}

/** Hinweis zum Einrichten, solange weder verbunden noch „nur lokal“ gewählt ist. */
export function SyncSetupHint() {
  const p = usePalette();
  const team = useTeam();
  if (!team.available || team.connected || team.localOnly) return null;
  return (
    <Card style={{ gap: spacing.sm, borderColor: p.primary }}>
      <View style={styles.row}>
        <Ionicons name="people-outline" size={22} color={p.primary} />
        <Text style={{ color: p.text, fontWeight: '700', fontSize: 16, flex: 1 }}>Mit dem Team verbinden</Text>
      </View>
      <Text style={{ color: p.muted }}>
        Daten verschlüsselt auf allen Geräten und mit dem Team teilen. Du brauchst deinen persönlichen GitHub-Token und das
        Team-Passwort.
      </Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button title="Einrichten" icon="cloud-outline" onPress={() => router.push('/connect')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Später" variant="secondary" onPress={() => team.setLocalOnly(true)} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 2, borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
