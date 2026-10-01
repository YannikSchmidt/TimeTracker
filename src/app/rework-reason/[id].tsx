import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, SectionTitle } from '../../components/ui';
import { useData } from '../../data/DataProvider';
import { jobTimes } from '../../domain/jobs';
import { reworkReasons } from '../../domain/suggestions';
import { formatDuration } from '../../domain/time';
import { useNow } from '../../hooks/useNow';
import { useWork } from '../../hooks/useWork';
import { radius, spacing, usePalette } from '../../theme';

/** Nacharbeit beenden: Grund wählen (bisherige Gründe als Vorschlag) oder eingeben. */
export default function ReworkReasonScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mutate } = useData();
  const work = useWork();
  const [reason, setReason] = useState('');
  const now = useNow(1000);
  const job = work.jobsById.get(id);
  const suggestions = reworkReasons(work.all.jobs);

  const save = async (value: string) => {
    const r = value.trim();
    if (!r) return;
    await mutate((repos) => repos.jobs.finish(id, { reworkReason: r }));
    router.back();
  };

  const workMs = job ? jobTimes(job, work.entriesOf.get(id) ?? [], now).workMs : 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: p.text }]}>Grund der Nacharbeit</Text>
      <Text style={{ color: p.muted }}>
        {job?.orderNo ? `Auftrag ${job.orderNo} · ` : ''}Nacharbeit {formatDuration(workMs)}
      </Text>

      {suggestions.length > 0 && (
        <View>
          <SectionTitle>Bisherige Gründe – antippen zum Speichern</SectionTitle>
          <View style={styles.chips}>
            {suggestions.map((s) => (
              <Chip key={s} label={s} color={p.warning} onPress={() => void save(s)} />
            ))}
          </View>
        </View>
      )}

      <View style={{ gap: spacing.sm }}>
        <SectionTitle>Neuer Grund</SectionTitle>
        <TextInput
          autoFocus={suggestions.length === 0}
          value={reason}
          onChangeText={setReason}
          onSubmitEditing={() => void save(reason)}
          placeholder="z.B. Grat entfernen, Maß korrigiert …"
          placeholderTextColor={p.muted}
          returnKeyType="done"
          accessibilityLabel="Grund der Nacharbeit"
          style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
        />
        <Button title="Speichern & beenden" icon="checkmark" variant="warning" size="large" onPress={() => void save(reason)} disabled={!reason.trim()} />
      </View>
      <Button title="Abbrechen (Nacharbeit bleibt pausiert)" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  title: { fontSize: 24, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52, fontSize: 17 },
});
