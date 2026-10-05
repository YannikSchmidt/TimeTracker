import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { DateTimeField } from '../../components/DateTimeField';
import { DeleteAction } from '../../components/DeleteAction';
import { Button, Card } from '../../components/ui';
import { useData, useQuery } from '../../data/DataProvider';
import { formatDuration, formatTime } from '../../domain/time';
import { usePermissions } from '../../hooks/usePermissions';
import { spacing, usePalette } from '../../theme';

/** Einen Arbeitsabschnitt (Start/Ende) korrigieren oder löschen. */
export default function EntryScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mutate } = useData();
  const perms = usePermissions();
  const { data: entry } = useQuery((r) => r.entries.get(id), [id]);

  const [startAt, setStartAt] = useState(0);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (entry && !loaded) {
    setStartAt(entry.startAt);
    setEndAt(entry.endAt);
    setLoaded(true);
  }
  if (!loaded) return null;

  const running = endAt === null;
  const invalid = !running && endAt <= startAt;

  const save = async () => {
    try {
      await mutate((r) => r.entries.update(id, { startAt, endAt }));
      router.back();
    } catch (e) {
      setError(`Speichern nicht möglich: ${e instanceof Error ? e.message : String(e)}`);
    }
  };


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <DateTimeField label="Start" value={startAt} onChange={setStartAt} />
        {running ? (
          <Text style={{ color: p.success, paddingVertical: spacing.sm }}>Läuft gerade</Text>
        ) : (
          <DateTimeField label="Ende" value={endAt} onChange={setEndAt} />
        )}
        <Text style={[styles.duration, { color: invalid ? p.danger : p.muted }]}>
          {invalid ? 'Ende muss nach dem Start liegen' : running ? '' : `Dauer: ${formatDuration(endAt - startAt)}`}
        </Text>
      </Card>
      {error && <Text style={{ color: p.danger }}>{error}</Text>}
      <Button title="Speichern" icon="checkmark" onPress={() => void save()} disabled={invalid} />
      <DeleteAction
        kind="entry"
        targetId={id}
        owner={perms.me}
        label={`Abschnitt ${formatTime(startAt)}${endAt ? ` – ${formatTime(endAt)}` : ''} am ${format(startAt, 'dd.MM.yyyy')}`}
        title="Abschnitt löschen"
        doDelete={(r) => r.entries.remove(id)}
        onDone={() => router.back()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  duration: { marginTop: spacing.sm, textAlign: 'right' },
});
