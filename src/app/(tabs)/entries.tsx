import { Ionicons } from '@expo/vector-icons';
import { format, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { EntryRow } from '../../components/EntryRow';
import { Empty } from '../../components/ui';
import { useQuery } from '../../data/DataProvider';
import { dailyTotals } from '../../domain/stats';
import { dayKey, formatDuration } from '../../domain/time';
import type { Entry } from '../../domain/types';
import { useArticles } from '../../hooks/useArticles';
import { useDimensions } from '../../hooks/useDimensions';
import { useNow } from '../../hooks/useNow';
import { spacing, usePalette } from '../../theme';

export default function EntriesScreen() {
  const p = usePalette();
  const dims = useDimensions();
  const articles = useArticles();
  const now = useNow(30_000);
  const { data: entries } = useQuery((r) => r.entries.listAll());

  const sections = useMemo(() => {
    const byDay = new Map<string, { dayStart: number; data: Entry[] }>();
    for (const e of entries ?? []) {
      const key = dayKey(e.startAt);
      const section = byDay.get(key) ?? { dayStart: startOfDay(e.startAt).getTime(), data: [] };
      section.data.push(e);
      byDay.set(key, section);
    }
    const all = { start: 0, end: Number.MAX_SAFE_INTEGER };
    const totals = dailyTotals(entries ?? [], all, now);
    return [...byDay.entries()].map(([key, s]) => ({
      key,
      title: format(s.dayStart, 'EEEE, d. MMMM yyyy', { locale: de }),
      total: totals.get(key) ?? 0,
      data: s.data,
    }));
  }, [entries, now]);

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: p.text }]}>{section.title}</Text>
            <Text style={{ color: p.muted, fontWeight: '600' }}>{formatDuration(section.total)}</Text>
          </View>
        )}
        renderItem={({ item }) => <EntryRow entry={item} valuesById={dims.valuesById} articlesById={articles.byId} now={now} />}
        ListEmptyComponent={<Empty text={entries ? 'Noch keine Einträge. Starte den Timer oder trage Zeit nach.' : 'Lädt …'} />}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Eintrag nachtragen"
        onPress={() => router.push('/entry/new')}
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
