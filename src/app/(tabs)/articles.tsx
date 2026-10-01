import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScanButton } from '../../components/ScanButton';
import { Empty } from '../../components/ui';
import { useData, useQuery } from '../../data/DataProvider';
import { suggestQuantity } from '../../domain/quantity';
import { entryDuration, formatDuration } from '../../domain/time';
import { matchArticles, useArticles } from '../../hooks/useArticles';
import { useNow } from '../../hooks/useNow';
import { radius, spacing, usePalette } from '../../theme';

export default function ArticlesScreen() {
  const p = usePalette();
  const { mutate } = useData();
  const articles = useArticles();
  const now = useNow(60_000);
  const { data: entries } = useQuery((r) => r.entries.listAll());
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Nutzung je Artikel: Anzahl Einträge, Gesamtzeit, häufigste Stückzahl
  const usage = useMemo(() => {
    const map = new Map<string, { count: number; ms: number }>();
    for (const e of entries ?? []) {
      if (!e.articleId) continue;
      const u = map.get(e.articleId) ?? { count: 0, ms: 0 };
      u.count++;
      u.ms += entryDuration(e, now);
      map.set(e.articleId, u);
    }
    return map;
  }, [entries, now]);

  const list = matchArticles(articles.articles, query);

  // Scannen: vorhandenen Artikel öffnen, unbekannten sofort anlegen
  const onScan = async (code: string) => {
    setMessage(null);
    const found = articles.articles.find((a) => a.number === code);
    if (found) {
      router.push(`/article/${found.id}`);
      return;
    }
    try {
      const created = await mutate((r) => r.articles.create({ number: code, name: '', description: '' }));
      router.push(`/article/${created.id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <View style={[styles.search, { backgroundColor: p.card, borderColor: p.border }]}>
          <Ionicons name="search" size={18} color={p.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nummer, Name oder Bezeichnung"
            placeholderTextColor={p.muted}
            accessibilityLabel="Artikel suchen"
            autoCorrect={false}
            style={[styles.searchInput, { color: p.text }]}
          />
        </View>
        <ScanButton label="Artikel scannen" onScan={(code) => void onScan(code)} />
      </View>
      {message && <Text style={[styles.message, { color: p.danger }]}>{message}</Text>}

      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <Empty
            text={
              !articles.loaded
                ? 'Lädt …'
                : query
                  ? `Kein Artikel passt zu „${query}“.`
                  : 'Noch keine Artikel. Lege sie mit „+“ an, scanne sie oder gib beim Timer-Start eine Nummer ein.'
            }
          />
        }
        renderItem={({ item }) => {
          const u = usage.get(item.id);
          const qty = suggestQuantity(entries ?? [], item.id, 0);
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/article/${item.id}`)}
              style={({ pressed }) => [styles.row, { backgroundColor: p.card, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>
                  {item.number}
                  {item.name ? <Text style={{ fontWeight: '400' }}>{`  ${item.name}`}</Text> : null}
                </Text>
                {item.description ? (
                  <Text style={{ color: p.muted }} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={{ color: p.muted, fontSize: 12 }}>
                  {u
                    ? `${u.count} Einträge · ${formatDuration(u.ms)}${qty.source === 'history' ? ` · meist ${qty.quantity} Stk` : ''}`
                    : 'Noch nicht verwendet'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={p.muted} />
            </Pressable>
          );
        }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Artikel anlegen"
        onPress={() => router.push('/article/new')}
        style={({ pressed }) => [styles.fab, { backgroundColor: p.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="add" size={30} color={p.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, height: '100%' },
  message: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  list: { padding: spacing.lg, paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
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
