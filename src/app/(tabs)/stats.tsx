import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarChart, DonutChart, ShareList, type ShareDatum } from '../../components/charts';
import { OwnerFilterBar } from '../../components/OwnerFilterBar';
import { Card, Chip, Empty, Expandable, Segmented } from '../../components/ui';
import {
  articleProduction,
  reworkByReason,
  bucketTotals,
  NONE_COLOR,
  totalsByKey,
  computeKpis,
  currentStreak,
  defaultBucketUnit,
  hourProfile,
  periodLabel,
  periodRange,
  shiftAnchor,
  totalsByDimension,
  weekdayTotals,
  type BucketUnit,
  type PeriodKind,
} from '../../domain/stats';
import { formatDuration } from '../../domain/time';
import { articleLabel, useArticles } from '../../hooks/useArticles';
import { useDimensions } from '../../hooks/useDimensions';
import { useNow } from '../../hooks/useNow';
import { useWork, type OwnerFilter } from '../../hooks/useWork';
import { spacing, usePalette, VALUE_COLORS } from '../../theme';

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: 'week', label: 'Woche' },
  { value: 'month', label: 'Monat' },
  { value: 'year', label: 'Jahr' },
];

const days = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Verlauf: längerer Rückblick passend zum gewählten Zeitraum. */
const TREND: Record<PeriodKind, { unit: BucketUnit; count: number; title: string }> = {
  week: { unit: 'week', count: 12, title: 'Letzte 12 Wochen' },
  month: { unit: 'month', count: 12, title: 'Letzte 12 Monate' },
  year: { unit: 'week', count: 0, title: 'Wochen im Jahr' },
};

export default function StatsScreen() {
  const p = usePalette();
  const now = useNow(60_000);
  const dims = useDimensions();
  const articles = useArticles();
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState(() => Date.now());
  /** Gruppierung der Verteilung: Artikel, Auftrag oder ein Merkmal (dessen ID) */
  const [group, setGroup] = useState<string>('article');

  const work = useWork();
  const [owner, setOwner] = useState<OwnerFilter>('me');
  const view = work.view(owner);
  const entries = view.segments;
  const settings = work.settings;

  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const isCurrent = range.start <= now && now < range.end;
  const dimension = dims.enabled.find((d) => d.id === group);

  const stats = useMemo(() => {
    const unit = defaultBucketUnit(kind);
    const trend = TREND[kind];
    const trendRange =
      trend.count > 0 ? { start: shiftAnchor(kind, range.start, -(trend.count - 1)), end: range.end } : range;
    const perDayTarget =
      settings.workDays.length > 0 ? (settings.weeklyTargetHours * 3_600_000) / settings.workDays.length : 0;
    return {
      kpis: computeKpis(entries, range, settings, now),
      buckets: bucketTotals(entries, range, unit, now),
      barTarget: unit === 'day' ? perDayTarget : undefined,
      trend: bucketTotals(entries, trendRange, trend.unit, now),
      streak: currentStreak(entries, now),
      hours: hourProfile(entries, range, now),
      weekdays: weekdayTotals(entries, range, now),
      shares: dimension
        ? totalsByDimension(entries, range, dimension, dims.values, now).map((s) => ({ ...s, key: s.valueId ?? 'none' }))
        : keyShares(
            totalsByKey(entries, range, (e) => (group === 'order' ? e.orderNo : e.articleId), now),
            (key) => (group === 'order' ? `Auftrag ${key}` : articles.byId.get(key) ? articleLabel(articles.byId.get(key)!) : 'Gelöschter Artikel'),
            group === 'order' ? 'Ohne Auftrag' : 'Ohne Artikel',
          ),
      production: articleProduction(entries, range, now),
      reworkReasons: reworkByReason(entries, view.jobs, range, now),
    };
  }, [entries, settings, range, kind, now, dimension, dims.values, group, articles.byId, view.jobs]);

  const { kpis } = stats;
  const balancePositive = kpis.balanceMs >= 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <OwnerFilterBar others={work.others} value={owner} onChange={setOwner} />
      <Segmented options={PERIODS} value={kind} onChange={setKind} />

      <View style={styles.periodRow}>
        <Pressable accessibilityLabel="Vorheriger Zeitraum" hitSlop={12} onPress={() => setAnchor(shiftAnchor(kind, anchor, -1))}>
          <Ionicons name="chevron-back" size={24} color={p.primary} />
        </Pressable>
        <Pressable onPress={() => setAnchor(Date.now())} style={{ flex: 1 }}>
          <Text style={[styles.periodLabel, { color: p.text }]}>{periodLabel(kind, range)}</Text>
          {!isCurrent && <Text style={[styles.today, { color: p.primary }]}>Zurück zu heute</Text>}
        </Pressable>
        <Pressable accessibilityLabel="Nächster Zeitraum" hitSlop={12} onPress={() => setAnchor(shiftAnchor(kind, anchor, 1))}>
          <Ionicons name="chevron-forward" size={24} color={p.primary} />
        </Pressable>
      </View>

      {/* Übersicht: das Wichtigste auf einen Blick */}
      <View style={styles.kpiGrid}>
        <Kpi
          label="Arbeitszeit"
          value={formatDuration(kpis.totalMs)}
          hint={kpis.reworkMs > 0 ? `davon Nacharbeit ${formatDuration(kpis.reworkMs)}` : undefined}
        />
        {owner === 'me' ? (
          <Kpi
            label={balancePositive ? 'Überstunden' : 'Fehlstunden'}
            value={`${balancePositive ? '+' : ''}${formatDuration(kpis.balanceMs)}`}
            color={balancePositive ? p.success : p.danger}
            hint={`Soll ${formatDuration(kpis.targetMs)}`}
          />
        ) : (
          // Sollzeiten anderer Personen sind nicht bekannt
          <Kpi label="Nacharbeit" value={formatDuration(kpis.reworkMs)} color={kpis.reworkMs > 0 ? p.warning : undefined} />
        )}
        <Kpi label="Ø pro aktivem Tag" value={formatDuration(kpis.avgPerActiveDayMs)} hint={`${days(kpis.activeDays)} aktiv`} />
        <Kpi label="Aufträge" value={String(kpis.jobCount)} hint={`Serie: ${days(stats.streak)}`} />
      </View>

      <Card>
        <BarChart data={stats.buckets} targetMs={stats.barTarget} />
      </Card>

      {/* Details: aufklappbar, damit die Übersicht schlank bleibt */}
      <Expandable title="Verteilung" icon="pie-chart-outline" initiallyOpen>
        <View style={styles.chips}>
          <Chip label="Artikel" selected={group === 'article'} onPress={() => setGroup('article')} />
          <Chip label="Auftrag" selected={group === 'order'} onPress={() => setGroup('order')} />
          {dims.enabled.map((d) => (
            <Chip key={d.id} label={d.name} selected={d.id === group} onPress={() => setGroup(d.id)} />
          ))}
        </View>
        {kpis.totalMs === 0 ? (
          <Empty text="Keine Zeit in diesem Zeitraum." />
        ) : (
          <View style={{ gap: spacing.lg }}>
            <DonutChart data={stats.shares} />
            <ShareList data={stats.shares} total={kpis.totalMs} />
            {dimension?.multi && (
              <Text style={{ color: p.muted, fontSize: 12 }}>
                Hinweis: Einträge mit mehreren {dimension.name} zählen bei jedem davon.
              </Text>
            )}
          </View>
        )}
      </Expandable>

      <Expandable title="Artikel & Stückzahlen" icon="cube-outline">
        {stats.production.length === 0 ? (
          <Empty text="Keine Aufträge mit Artikel in diesem Zeitraum." />
        ) : (
          <View>
            <View style={[styles.tableRow, { borderBottomColor: p.border }]}>
              <Text style={[styles.colName, styles.th, { color: p.muted }]}>Artikel</Text>
              <Text style={[styles.colNum, styles.th, { color: p.muted }]}>Zeit</Text>
              <Text style={[styles.colNum, styles.th, { color: p.muted }]}>Nacharb.</Text>
              <Text style={[styles.colNum, styles.th, { color: p.muted }]}>Stück</Text>
              <Text style={[styles.colNum, styles.th, { color: p.muted }]}>Min/Stk</Text>
            </View>
            {stats.production.map((row) => {
              const a = articles.byId.get(row.articleId);
              return (
                <View key={row.articleId} style={[styles.tableRow, { borderBottomColor: p.border }]}>
                  <View style={styles.colName}>
                    <Text style={{ color: p.text, fontWeight: '600' }} numberOfLines={1}>
                      {a?.number ?? 'Gelöscht'}
                    </Text>
                    {a?.name ? (
                      <Text style={{ color: p.muted, fontSize: 12 }} numberOfLines={1}>
                        {a.name}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.colNum, { color: p.text }]}>{formatDuration(row.ms)}</Text>
                  <Text style={[styles.colNum, { color: row.reworkMs > 0 ? p.warning : p.muted }]}>
                    {row.reworkMs > 0 ? formatDuration(row.reworkMs) : '–'}
                  </Text>
                  <Text style={[styles.colNum, { color: p.text }]}>{row.pieces || '–'}</Text>
                  <Text style={[styles.colNum, { color: p.text }]}>
                    {row.msPerPiece == null ? '–' : (row.msPerPiece / 60_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}
                  </Text>
                </View>
              );
            })}
            <Text style={{ color: p.muted, fontSize: 12, marginTop: spacing.sm }}>
              Zeit = Arbeitszeit ohne Nacharbeit. Min/Stk: Arbeitszeit der Aufträge mit Stückzahl geteilt durch ihre Stückzahl.
            </Text>
          </View>
        )}
      </Expandable>

      <Expandable title="Nacharbeit" icon="construct-outline">
        {stats.reworkReasons.length === 0 ? (
          <Empty text="Keine Nacharbeit in diesem Zeitraum." />
        ) : (
          <View style={{ gap: spacing.md }}>
            <Text style={{ color: p.text }}>
              Gesamt <Text style={{ fontWeight: '700', color: p.warning }}>{formatDuration(kpis.reworkMs)}</Text>
              {kpis.totalMs > 0 ? ` · ${Math.round((kpis.reworkMs / kpis.totalMs) * 100)}% der Arbeitszeit` : ''}
            </Text>
            <ShareList
              data={stats.reworkReasons.map((r, i) => ({
                key: r.key ?? 'none',
                name: r.key ?? 'Ohne Grund',
                color: r.key ? VALUE_COLORS[(i + 2) % VALUE_COLORS.length] : NONE_COLOR,
                ms: r.ms,
              }))}
              total={kpis.reworkMs}
            />
          </View>
        )}
      </Expandable>

      <Expandable title={`Verlauf · ${TREND[kind].title}`} icon="trending-up-outline">
        <BarChart data={stats.trend} />
      </Expandable>

      <Expandable title="Weitere Kennzahlen" icon="speedometer-outline">
        <Row label="Längste Session" value={formatDuration(kpis.longestMs)} />
        <Row label="Aktive Tage" value={String(kpis.activeDays)} />
        <Row label="Soll im Zeitraum (bis heute)" value={formatDuration(kpis.targetMs)} />
        <Row label="Ist im Zeitraum" value={formatDuration(kpis.totalMs)} />
        <Row label="Aktuelle Serie" value={days(stats.streak)} />
        <Row label="Wochen-Soll" value={`${settings.weeklyTargetHours} h`} />
      </Expandable>

      <Expandable title="Wochentage" icon="calendar-outline">
        <BarChart data={stats.weekdays.map((ms, i) => ({ label: WEEKDAYS[i], ms }))} height={150} />
      </Expandable>

      <Expandable title="Tageszeiten" icon="time-outline">
        <BarChart data={stats.hours.map((ms, h) => ({ label: String(h), ms }))} height={150} />
      </Expandable>
    </ScrollView>
  );
}

const MAX_SHARES = 8;

/** Gruppen-Summen → Diagrammdaten; ab dem 9. Eintrag als „Weitere“ zusammengefasst. */
function keyShares(totals: { key: string | null; ms: number }[], nameOf: (key: string) => string, noneName: string): ShareDatum[] {
  const named = totals.filter((t) => t.key !== null);
  const none = totals.find((t) => t.key === null);
  const shown: ShareDatum[] = named.slice(0, MAX_SHARES).map((t, i) => ({
    key: t.key!,
    name: nameOf(t.key!),
    color: VALUE_COLORS[i % VALUE_COLORS.length],
    ms: t.ms,
  }));
  const restMs = named.slice(MAX_SHARES).reduce((s, t) => s + t.ms, 0);
  if (restMs > 0) shown.push({ key: 'rest', name: `Weitere (${named.length - MAX_SHARES})`, color: '#6B7280', ms: restMs });
  if (none) shown.push({ key: 'none', name: noneName, color: NONE_COLOR, ms: none.ms });
  return shown;
}

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  const p = usePalette();
  return (
    <Card style={styles.kpi}>
      <Text style={{ color: p.muted, fontSize: 13 }}>{label}</Text>
      <Text style={[styles.kpiValue, { color: color ?? p.text }]}>{value}</Text>
      {hint && <Text style={{ color: p.muted, fontSize: 12 }}>{hint}</Text>}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={[styles.row, { borderBottomColor: p.border }]}>
      <Text style={{ color: p.text }}>{label}</Text>
      <Text style={{ color: p.text, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  periodLabel: { textAlign: 'center', fontSize: 17, fontWeight: '600' },
  today: { textAlign: 'center', fontSize: 12, marginTop: 2 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpi: { flexBasis: '47%', flexGrow: 1, gap: 2, padding: spacing.md },
  kpiValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  th: { fontSize: 12, fontWeight: '600' },
  colName: { flex: 1, minWidth: 0 },
  colNum: { width: 62, textAlign: 'right', fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
