import { Ionicons } from '@expo/vector-icons';
import { addDays, startOfDay } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EntryRow } from '../../components/EntryRow';
import { DimensionPicker } from '../../components/ValuePicker';
import { Card, Empty, SectionTitle } from '../../components/ui';
import { useData, useQuery } from '../../data/DataProvider';
import { totalMs } from '../../domain/stats';
import { formatClock, formatDuration } from '../../domain/time';
import { articleLabel, useArticles } from '../../hooks/useArticles';
import { useDimensions } from '../../hooks/useDimensions';
import { useNow } from '../../hooks/useNow';
import { radius, spacing, usePalette } from '../../theme';

export default function TimerScreen() {
  const p = usePalette();
  const { mutate } = useData();
  const dims = useDimensions();
  const articles = useArticles();
  const now = useNow(1000);

  const dayStart = startOfDay(now).getTime();
  const dayEnd = addDays(dayStart, 1).getTime();
  const { data } = useQuery(
    async (r) => ({
      running: await r.entries.getRunning(),
      today: await r.entries.listInRange(dayStart, dayEnd),
    }),
    [dayStart],
  );
  const running = data?.running ?? null;
  const today = data?.today ?? [];

  // Auswahl & Notiz: gehören zum laufenden Eintrag bzw. zum nächsten Start.
  const [valueIds, setValueIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [syncedId, setSyncedId] = useState<string | null>(null);
  if (running && running.id !== syncedId) {
    setSyncedId(running.id);
    setValueIds(running.valueIds);
    setNote(running.note);
  }

  const toggleTimer = async () => {
    if (running) {
      await mutate((r) => r.entries.update(running.id, { note, valueIds }).then(() => r.entries.stop(running.id)));
      setNote('');
    } else {
      // Erst Artikel/Auftrag/Stückzahl abfragen – der Timer startet am Ende der Abfrage.
      router.push({ pathname: '/start', params: { valueIds: JSON.stringify(valueIds), note } });
    }
  };

  const changeValues = (ids: string[]) => {
    setValueIds(ids);
    if (running) void mutate((r) => r.entries.update(running.id, { valueIds: ids }));
  };

  const saveNote = () => {
    if (running && note !== running.note) void mutate((r) => r.entries.update(running.id, { note }));
  };

  const elapsed = running ? now - running.startAt : 0;
  const runningArticle = running?.articleId ? articles.byId.get(running.articleId) : undefined;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.timerBox}>
        <Text style={[styles.clock, { color: running ? p.text : p.muted }]}>{formatClock(elapsed)}</Text>
        <Text style={{ color: p.muted }}>
          Heute gesamt: {formatDuration(totalMs(today, { start: dayStart, end: dayEnd }, now))}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={running ? 'Timer stoppen' : 'Timer starten'}
          onPress={toggleTimer}
          style={({ pressed }) => [
            styles.bigButton,
            { backgroundColor: running ? p.danger : p.primary, transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
        >
          <Text style={styles.bigButtonText}>{running ? 'Stopp' : 'Start'}</Text>
        </Pressable>
      </View>

      {running && (
        <Pressable accessibilityRole="button" accessibilityLabel="Laufenden Eintrag bearbeiten" onPress={() => router.push(`/entry/${running.id}`)}>
          <Card style={styles.jobCard}>
            <JobInfo icon="cube-outline" label="Artikel" value={runningArticle ? articleLabel(runningArticle) : '–'} />
            <JobInfo icon="document-text-outline" label="Auftrag" value={running.orderNo ?? '–'} />
            <JobInfo icon="layers-outline" label="Stückzahl" value={running.quantity == null ? '–' : `${running.quantity} Stk`} />
            <Text style={{ color: p.primary, fontSize: 13 }}>Tippen zum Bearbeiten</Text>
          </Card>
        </Pressable>
      )}

      <Card style={{ gap: spacing.lg }}>
        <DimensionPicker dims={dims} selected={valueIds} onChange={changeValues} />
        <View>
          <SectionTitle>Notiz</SectionTitle>
          <TextInput
            value={note}
            onChangeText={setNote}
            onBlur={saveNote}
            placeholder="Woran arbeitest du?"
            placeholderTextColor={p.muted}
            style={[styles.input, { color: p.text, borderColor: p.border }]}
          />
        </View>
      </Card>

      <View>
        <SectionTitle>Heute</SectionTitle>
        {today.length === 0 ? (
          <Empty text="Noch keine Einträge heute." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {today.map((e) => (
              <EntryRow key={e.id} entry={e} valuesById={dims.valuesById} articlesById={articles.byId} now={now} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function JobInfo({ icon, label, value }: { icon: 'cube-outline' | 'document-text-outline' | 'layers-outline'; label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={styles.jobRow}>
      <Ionicons name={icon} size={20} color={p.muted} />
      <Text style={{ color: p.muted, width: 80 }}>{label}</Text>
      <Text style={{ color: p.text, fontWeight: '700', fontSize: 16, flex: 1 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.xl },
  jobCard: { gap: spacing.sm },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timerBox: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
  clock: { fontSize: 56, fontWeight: '300', fontVariant: ['tabular-nums'] },
  bigButton: {
    marginTop: spacing.lg,
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  bigButtonText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 16 },
});
