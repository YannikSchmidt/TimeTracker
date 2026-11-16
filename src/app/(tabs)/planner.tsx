import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, Empty, SectionTitle } from '../../components/ui';
import { useData } from '../../data/DataProvider';
import { formatDecimal, planItemMs, planSummary, planTarget } from '../../domain/planner';
import { suggestQuantity } from '../../domain/quantity';
import { periodRange, totalMs } from '../../domain/stats';
import { formatDuration } from '../../domain/time';
import type { PlanItem } from '../../domain/types';
import { articleLabel, matchArticles, useArticles } from '../../hooks/useArticles';
import { useGroups } from '../../hooks/useGroups';
import { useNow } from '../../hooks/useNow';
import { useWork } from '../../hooks/useWork';
import { radius, spacing, usePalette } from '../../theme';

/**
 * Planer: Artikel mit Stückzahl eintragen → Vorgabezeit gesamt in Stunden und Arbeitstagen, wie viel davon noch in
 * die Woche passt (abzüglich der schon gearbeiteten Zeit) und wie viele Stück je Artikel noch reinpassen.
 */
export default function PlannerScreen() {
  const p = usePalette();
  const { mutate } = useData();
  const articles = useArticles();
  const groups = useGroups();
  const work = useWork();
  const now = useNow(60_000);
  const [query, setQuery] = useState('');

  const settings = work.settings;
  const items: PlanItem[] = useMemo(
    () => (settings.planner ?? []).filter((i) => articles.byId.has(i.articleId) || !articles.loaded),
    [settings.planner, articles],
  );
  const save = (next: PlanItem[]) => mutate((r) => r.settings.set({ planner: next }));

  const rows = items.map((item) => {
    const article = articles.byId.get(item.articleId);
    const target = planTarget(article, (section) => groups.flowOf(article, section).steps, groups.hasSections(article));
    return { item, article, target, ms: planItemMs(target, item.quantity) };
  });
  const workedMs = totalMs(work.segments, periodRange('week', now), now);
  const summary = planSummary(
    rows.map((r) => ({ target: r.target, quantity: r.item.quantity })),
    settings.weeklyTargetHours,
    settings.workDays.length,
    workedMs,
  );

  const add = (articleId: string) => {
    setQuery('');
    const existing = items.find((i) => i.articleId === articleId);
    if (existing) return;
    const quantity = suggestQuantity(work.jobs, articleId, settings.defaultQuantity).quantity || 1;
    void save([...items, { articleId, quantity }]);
  };
  const setQty = (articleId: string, quantity: number) =>
    void save(items.map((i) => (i.articleId === articleId ? { ...i, quantity: Math.max(0, Math.min(9999, quantity)) } : i)));
  const remove = (articleId: string) => void save(items.filter((i) => i.articleId !== articleId));

  const hits = query.trim() ? matchArticles(articles.articles, query, 6) : [];
  const weekMs = summary.weekMs || 1;
  const workedPct = Math.min(100, (workedMs / weekMs) * 100);
  const plannedPct = Math.min(100 - workedPct, (summary.totalMs / weekMs) * 100);
  const over = summary.freeMs < 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: p.muted }}>Geplant gesamt</Text>
        <Text style={[styles.total, { color: p.text }]} accessibilityLabel="Geplant gesamt">
          {formatDuration(summary.totalMs)}
        </Text>
        <Text style={{ color: p.text }}>
          = {formatDecimal(summary.days)} Arbeitstage · {formatDecimal(summary.weeks, 2)} Wochen
        </Text>
        <View style={[styles.bar, { backgroundColor: p.track }]}>
          <View style={{ width: `${workedPct}%`, backgroundColor: p.muted }} />
          <View style={{ width: `${plannedPct}%`, backgroundColor: over ? p.danger : p.primary }} />
        </View>
        <View style={styles.legend}>
          <Text style={{ color: p.muted, fontSize: 13 }}>■ diese Woche gearbeitet {formatDuration(workedMs)}</Text>
          <Text style={{ color: over ? p.danger : p.primary, fontSize: 13 }}>■ geplant {formatDuration(summary.totalMs)}</Text>
        </View>
        <Text style={[styles.free, { color: over ? p.danger : p.success }]}>
          {over ? `${formatDuration(-summary.freeMs)} zu viel für diese Woche` : `Noch ${formatDuration(summary.freeMs)} frei diese Woche`}
        </Text>
        <Pressable accessibilityRole="link" onPress={() => router.navigate('/settings')}>
          <Text style={{ color: p.muted, fontSize: 12 }}>
            Wochenarbeitszeit {formatDecimal(settings.weeklyTargetHours, 2)} h an {settings.workDays.length} Tagen (
            {formatDecimal(summary.hoursPerDay, 2)} h/Tag) – in den Einstellungen ändern
          </Text>
        </Pressable>
      </Card>

      <SectionTitle>Artikel hinzufügen</SectionTitle>
      <View style={[styles.search, { borderColor: p.border, backgroundColor: p.card }]}>
        <Ionicons name="search" size={18} color={p.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Nummer oder Benennung"
          placeholderTextColor={p.muted}
          accessibilityLabel="Artikel suchen"
          style={[styles.searchInput, { color: p.text }]}
        />
      </View>
      {hits.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          onPress={() => add(a.id)}
          style={({ pressed }) => [styles.hit, { backgroundColor: p.card, opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="add-circle-outline" size={20} color={p.primary} />
          <Text style={{ color: p.text, flex: 1 }} numberOfLines={1}>
            {articleLabel(a)}
          </Text>
        </Pressable>
      ))}
      {query.trim() !== '' && hits.length === 0 && <Empty text="Kein Artikel gefunden." />}

      <SectionTitle
        right={
          rows.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => void save([])}>
              <Text style={{ color: p.danger }}>Liste leeren</Text>
            </Pressable>
          ) : undefined
        }
      >
        Planung
      </SectionTitle>
      {rows.length === 0 && <Empty text="Noch nichts geplant. Artikel suchen und mit Stückzahl eintragen – die Liste bleibt gespeichert." />}
      {rows.map(({ item, article, target, ms }, i) => {
        const fits = summary.fitsMore[i];
        const label = article ? articleLabel(article) : 'Artikel';
        return (
          <Card key={item.articleId} style={{ gap: spacing.sm }}>
            <View style={styles.rowHead}>
              <Text style={[styles.rowTitle, { color: p.text }]} numberOfLines={2}>
                {label}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${label} entfernen`} onPress={() => remove(item.articleId)} hitSlop={8}>
                <Ionicons name="close" size={20} color={p.muted} />
              </Pressable>
            </View>
            <View style={styles.rowHead}>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="weniger"
                  onPress={() => setQty(item.articleId, item.quantity - 1)}
                  style={[styles.stepBtn, { backgroundColor: p.track }]}
                >
                  <Ionicons name="remove" size={18} color={p.text} />
                </Pressable>
                <TextInput
                  value={String(item.quantity)}
                  onChangeText={(t) => setQty(item.articleId, Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0)}
                  keyboardType="number-pad"
                  accessibilityLabel={`Stückzahl ${label}`}
                  style={[styles.qty, { color: p.text, borderColor: p.border }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="mehr"
                  onPress={() => setQty(item.articleId, item.quantity + 1)}
                  style={[styles.stepBtn, { backgroundColor: p.track }]}
                >
                  <Ionicons name="add" size={18} color={p.text} />
                </Pressable>
                <Text style={{ color: p.muted }}>Stück</Text>
              </View>
              <Text style={[styles.rowMs, { color: target.hasTarget ? p.text : p.muted }]}>{target.hasTarget ? formatDuration(ms) : '–'}</Text>
            </View>
            {target.hasTarget ? (
              <Text style={{ color: p.muted, fontSize: 13 }}>
                Vorgabe {formatDuration(target.perPieceMs)} pro Stück
                {target.setupMs > 0 ? ` + ${formatDuration(target.setupMs)} Rüsten` : ''}
                {fits !== null ? ` · passt noch ${fits} Stück` : ''}
              </Text>
            ) : (
              <Text style={{ color: p.warning, fontSize: 13 }}>Keine Vorgabezeit hinterlegt – zählt nicht mit.</Text>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: 100 },
  total: { fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  bar: { height: 12, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  free: { fontWeight: '600' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, height: '100%' },
  hit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepBtn: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  qty: { width: 64, height: 36, borderWidth: 1, borderRadius: radius.sm, textAlign: 'center', fontSize: 16 },
  rowMs: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
