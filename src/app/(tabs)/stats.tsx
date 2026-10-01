import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarChart, DonutChart, ShareList } from '../../components/charts';
import { Card, Chip, Empty, Expandable, Segmented } from '../../components/ui';
import { useQuery } from '../../data/DataProvider';
import {
  bucketTotals,
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
import { DEFAULT_SETTINGS } from '../../domain/types';
import { useDimensions } from '../../hooks/useDimensions';
import { useNow } from '../../hooks/useNow';
import { spacing, usePalette } from '../../theme';

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
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState(() => Date.now());
  const [dimensionId, setDimensionId] = useState<string | null>(null);

  const { data } = useQuery(async (r) => ({
    entries: await r.entries.listAll(),
    settings: await r.settings.get(),
  }));
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const settings = data?.settings ?? DEFAULT_SETTINGS;

  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const isCurrent = range.start <= now && now < range.end;
  const dimension = dims.enabled.find((d) => d.id === dimensionId) ?? dims.enabled[0];

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
      shares: dimension ? totalsByDimension(entries, range, dimension, dims.values, now) : [],
    };
  }, [entries, settings, range, kind, now, dimension, dims.values]);

  const { kpis } = stats;
  const balancePositive = kpis.balanceMs >= 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
        <Kpi label="Gesamt" value={formatDuration(kpis.totalMs)} />
        <Kpi
          label={balancePositive ? 'Überstunden' : 'Fehlstunden'}
          value={`${balancePositive ? '+' : ''}${formatDuration(kpis.balanceMs)}`}
          color={balancePositive ? p.success : p.danger}
          hint={`Soll ${formatDuration(kpis.targetMs)}`}
        />
        <Kpi label="Ø pro aktivem Tag" value={formatDuration(kpis.avgPerActiveDayMs)} hint={`${days(kpis.activeDays)} aktiv`} />
        <Kpi label="Einträge" value={String(kpis.entryCount)} hint={`Serie: ${days(stats.streak)}`} />
      </View>

      <Card>
        <BarChart data={stats.buckets} targetMs={stats.barTarget} />
      </Card>

      {/* Details: aufklappbar, damit die Übersicht schlank bleibt */}
      <Expandable title="Verteilung nach Merkmal" icon="pie-chart-outline" initiallyOpen>
        {dims.enabled.length > 1 && (
          <View style={styles.chips}>
            {dims.enabled.map((d) => (
              <Chip key={d.id} label={d.name} selected={d.id === dimension?.id} onPress={() => setDimensionId(d.id)} />
            ))}
          </View>
        )}
        {kpis.totalMs === 0 ? (
          <Empty text="Keine Zeit in diesem Zeitraum." />
        ) : (
          <View style={{ gap: spacing.lg }}>
            <DonutChart data={stats.shares.map((s) => ({ ...s, key: s.valueId ?? 'none' }))} />
            <ShareList data={stats.shares.map((s) => ({ ...s, key: s.valueId ?? 'none' }))} total={kpis.totalMs} />
            {dimension?.multi && (
              <Text style={{ color: p.muted, fontSize: 12 }}>
                Hinweis: Einträge mit mehreren {dimension.name} zählen bei jedem davon.
              </Text>
            )}
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
