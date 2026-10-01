import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { InviteJoin } from '../components/InviteJoin';
import { Button, Card } from '../components/ui';
import { useTeam } from '../sync/TeamContext';
import { spacing, usePalette } from '../theme';

/** Einladungslink `/join#<code>`: der Code steht hinter „#“ und erreicht nie einen Server. */
export default function JoinScreen() {
  const p = usePalette();
  const team = useTeam();
  const [code] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '')));
  const done = () => router.replace('/');

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: p.text }]}>Dem Team beitreten</Text>
      {team.connected ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: p.text }}>
            Dieses Gerät ist schon verbunden als <Text style={{ fontWeight: '700' }}>{team.name ?? team.login}</Text>.
          </Text>
          <Button title="Zur App" onPress={done} />
        </Card>
      ) : !team.available ? (
        <Text style={{ color: p.muted }}>Einladungen funktionieren nur in der Web-App unter ihrer eigenen Adresse.</Text>
      ) : (
        <InviteJoin initialInvite={code || null} onDone={done} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 24, fontWeight: '800' },
});
