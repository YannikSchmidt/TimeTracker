import { Ionicons } from '@expo/vector-icons';
import { format, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { JobRow } from '../../components/JobRow';
import { Empty } from '../../components/ui';
import { dailyTotals } from '../../domain/stats';
import { dayKey, formatDuration } from '../../domain/time';
import type { Job } from '../../domain/types';
import { useArticles } from '../../hooks/useArticles';
import { useNow } from '../../hooks/useNow';
import { useWork } from '../../hooks/useWork';
import { spacing, usePalette } from '../../theme';

export default function HistoryScreen() {
  const p = usePalette();
  const work = useWork();
  const articles = useArticles();
  const now = useNow(30_000);

  // Aufträge nach Tag des ersten Starts; Nacharbeit erscheint direkt unter ihrem Auftrag
  const sections = useMemo(() => {
    const reworkByParent = new Map<string, Job[]>();
    for (const j of work.jobs) {
      if (j.kind === 'rework' && j.parentJobId && work.jobsById.has(j.parentJobId)) {
        reworkByParent.set(j.parentJobId, [...(reworkByParent.get(j.parentJobId) ?? []), j]);
      }
    }
    const byDay = new Map<string, { dayStart: number; data: Job[] }>();
    for (const j of [...work.jobs].sort((a, b) => b.startedAt - a.startedAt)) {
      if (j.kind === 'rework' && j.parentJobId && work.jobsById.has(j.parentJobId)) continue;
      const key = dayKey(j.startedAt);
      const section = byDay.get(key) ?? { dayStart: startOfDay(j.startedAt).getTime(), data: [] };
      section.data.push(j, ...(reworkByParent.get(j.id) ?? []).sort((a, b) => a.startedAt - b.startedAt));
      byDay.set(key, section);
    }
    const totals = dailyTotals(work.segments, { start: 0, end: Number.MAX_SAFE_INTEGER }, now);
    return [...byDay.entries()].map(([key, s]) => ({
      key,
      title: format(s.dayStart, 'EEEE, d. MMMM yyyy', { locale: de }),
      total: totals.get(key) ?? 0,
      data: s.data,
    }));
  }, [work, now]);

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(j) => j.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: p.text }]}>{section.title}</Text>
            <Text style={{ color: p.muted, fontWeight: '600' }}>Arbeitszeit {formatDuration(section.total)}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={item.kind === 'rework' && item.parentJobId ? styles.indent : undefined}>
            <JobRow
              job={item}
              entries={work.entriesOf.get(item.id) ?? []}
              article={item.articleId ? articles.byId.get(item.articleId) : undefined}
              now={now}
            />
          </View>
        )}
        ListEmptyComponent={<Empty text={work.loaded ? 'Noch keine Aufträge. Starte im Timer-Tab oder trage Zeit nach.' : 'Lädt …'} />}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Auftrag nachtragen"
        onPress={() => router.push('/job/new')}
        style={({ pressed }) => [styles.fab, { backgroundColor: p.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="add" size={30} color={p.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  indent: { marginLeft: spacing.xl },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
