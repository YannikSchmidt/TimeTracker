import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { DateTimeField } from '../../components/DateTimeField';
import { DimensionPicker } from '../../components/ValuePicker';
import { Button, Card, SectionTitle } from '../../components/ui';
import { useData, useQuery } from '../../data/DataProvider';
import { formatDuration } from '../../domain/time';
import { useDimensions } from '../../hooks/useDimensions';
import { radius, spacing, usePalette } from '../../theme';

const HOUR = 3_600_000;

/** Eintrag bearbeiten (`/entry/<id>`) oder neu nachtragen (`/entry/new`). */
export default function EntryScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { mutate } = useData();
  const dims = useDimensions();
  const { data: entry } = useQuery((r) => (isNew ? Promise.resolve(null) : r.entries.get(id)), [id]);

  const [startAt, setStartAt] = useState(() => Date.now() - HOUR);
  const [endAt, setEndAt] = useState<number | null>(() => Date.now());
  const [note, setNote] = useState('');
  const [valueIds, setValueIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);

  if (entry && !loaded) {
    setStartAt(entry.startAt);
    setEndAt(entry.endAt);
    setNote(entry.note);
    setValueIds(entry.valueIds);
    setLoaded(true);
  }

  const running = endAt === null;
  const invalid = !running && endAt <= startAt;

  const save = async () => {
    try {
      const input = { startAt, endAt, note: note.trim(), valueIds };
      await mutate(async (r) => {
        if (isNew) await r.entries.create(input);
        else await r.entries.update(id, input);
      });
      router.back();
    } catch (e) {
      Alert.alert('Speichern nicht möglich', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () =>
    Alert.alert('Eintrag löschen?', 'Das kann nicht rückgängig gemacht werden.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await mutate((r) => r.entries.remove(id));
          router.back();
        },
      },
    ]);

  if (!loaded) return null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Zeit nachtragen' : 'Eintrag bearbeiten' }} />

      <Card>
        <DateTimeField label="Start" value={startAt} onChange={setStartAt} />
        {!isNew && (
          <View style={styles.switchRow}>
            <Text style={{ color: p.text, fontSize: 16 }}>Läuft noch</Text>
            <Switch value={running} onValueChange={(v) => setEndAt(v ? null : Date.now())} />
          </View>
        )}
        {!running && <DateTimeField label="Ende" value={endAt} onChange={setEndAt} />}
        <Text style={[styles.duration, { color: invalid ? p.danger : p.muted }]}>
          {invalid ? 'Ende muss nach dem Start liegen' : running ? 'Timer läuft' : `Dauer: ${formatDuration(endAt - startAt)}`}
        </Text>
      </Card>

      <Card style={{ gap: spacing.lg }}>
        <DimensionPicker dims={dims} selected={valueIds} onChange={setValueIds} />
        <View>
          <SectionTitle>Notiz</SectionTitle>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            placeholderTextColor={p.muted}
            multiline
            style={[styles.input, { color: p.text, borderColor: p.border }]}
          />
        </View>
      </Card>

      <Button title="Speichern" icon="checkmark" onPress={save} disabled={invalid} />
      {!isNew && <Button title="Löschen" icon="trash-outline" variant="danger" onPress={remove} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  duration: { marginTop: spacing.sm, textAlign: 'right' },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 16, minHeight: 60 },
});
