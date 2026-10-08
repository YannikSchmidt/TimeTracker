import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarChart, DonutChart, ShareList, type ShareDatum } from '../../components/charts';
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
import { jobName } from '../../domain/jobs';
import {
  balanceMs,
  compareJobs,
  compareShare,
  formatBalance,
  orderArticle,
  orderKey,
  sameOrder,
  teamPraise,
  type Comparison,
  type ComparisonRow,
} from '../../domain/targets';
import { formatDuration } from '../../domain/time';
import { DEFAULT_SETTINGS, type Job } from '../../domain/types';
import { articleLabel, useArticles } from '../../hooks/useArticles';
import { useDimensions } from '../../hooks/useDimensions';
import { useGroups } from '../../hooks/useGroups';
import { useNow } from '../../hooks/useNow';
import { useWork } from '../../hooks/useWork';
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
  const groups = useGroups();
  const [vsMain, setVsMain] = useState<'device' | 'part' | 'none'>('device');
  // Datenschutz: Die Statistik zeigt nur die eigenen Zeiten; mit dem Team gibt es nur einen groben, positiven Vergleich.
  const view = work.view('me');
  const entries = view.segments;

  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const isCurrent = range.start <= now && now < range.end;
  const dimension = dims.enabled.find((d) => d.id === group);

  const stats = useMemo(() => {
    const unit = defaultBucketUnit(kind);
    const trend = TREND[kind];
    const trendRange =
      trend.count > 0 ? { start: shiftAnchor(kind, range.start, -(trend.count - 1)), end: range.end } : range;
    // Vorgabe gegen Ist: abgeschlossene Aufträge mit Abschluss im Zeitraum. Arbeiten mehrere am selben Auftrag,
    // wird die Vorgabe im Verhältnis der geleisteten Zeit aufgeteilt (eigener Anteil).
    const inRange = (j: Job) => j.kind === 'order' && j.status === 'done' && j.finishedAt !== null && j.finishedAt >= range.start && j.finishedAt < range.end;
    const shareOf = (mine: Job[]) => {
      const parts = work.all.jobs.filter((j) => j.kind === 'order' && (mine.some((o) => o.id === j.id) || mine.some((o) => sameOrder(o, j))));
      const job = { ...mine[0], quantity: Math.max(0, ...parts.map((j) => j.quantity ?? 0)) || mine[0].quantity };
      // Vorgabe vom eigenen Artikel, sonst vom Artikel eines Kollegen am selben Auftrag
      const article = orderArticle([...mine, ...parts], articles.byId);
      const flow = groups.flowOf((job.articleId ? articles.byId.get(job.articleId) : undefined) ?? article);
      const own = new Set(mine.map((j) => j.id));
      const comparison = compareShare(parts.map((j) => ({ job: j, entries: work.all.entriesOf.get(j.id) ?? [] })), own, article, flow.steps, now);
      return { job, flow, comparison, shared: parts.some((j) => !own.has(j.id)), name: jobName(job, article ?? null) };
    };
    const byOrder = (jobs: Job[]) => {
      const map = new Map<string, Job[]>();
      for (const job of jobs) map.set(orderKey(job), [...(map.get(orderKey(job)) ?? []), job]);
      return [...map.values()];
    };
    const compared = byOrder(view.jobs.filter(inRange)).map(shareOf);
    // Grober Team-Vergleich: je Person Summe aus Ist und anteiliger Vorgabe – angezeigt wird nur ein Lob
    const people = new Map<string, Job[]>();
    for (const j of work.all.jobs.filter(inRange)) {
      const who = work.ownerOf(j) ?? '-';
      people.set(who, [...(people.get(who) ?? []), j]);
    }
    const praise = work.me
      ? teamPraise(
          work.me,
          [...people.entries()].map(([id, jobs]) => {
            const shares = byOrder(jobs).map((g) => shareOf(g).comparison).filter((c) => c.targetMs);
            return { id, actualMs: shares.reduce((s, c) => s + c.actualMs, 0), targetMs: shares.reduce((s, c) => s + c.targetMs!, 0) };
          }),
        )
      : null;
    const flowOfJob = new Map(compared.map((c) => [c.job.id, c.flow]));
    const mainKey = (id: string) => flowOfJob.get(id)?.main ?? 'none';
    // Einzelne Aufträge: Ist gegen Soll (bei Zusammenarbeit dein Anteil), neueste zuerst
    const orders = compared
      .filter((c) => c.comparison.targetMs !== null || c.shared)
      .sort((a, b) => (b.job.finishedAt ?? 0) - (a.job.finishedAt ?? 0))
      .map((c) => ({ key: c.job.id, name: c.name, shared: c.shared, comparison: c.comparison }));
    return {
      praise,
      orders,
      kpis: computeKpis(entries, range, DEFAULT_SETTINGS, now),
      buckets: bucketTotals(entries, range, unit, now),
      vsMains: (['device', 'part', 'none'] as const).map((main) => {
        const items = compared.filter((c) => mainKey(c.job.id) === main);
        return {
          main,
          total: compareJobs(items, () => 'all')[0] ?? null,
          subgroups: compareJobs(items, (j) => flowOfJob.get(j.id)?.subgroup?.id ?? '-'),
          articles: compareJobs(items, (j) => j.articleId ?? '-'),
        };
      }),
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
  }, [entries, range, kind, now, dimension, dims.values, group, articles, view.jobs, work, groups]);

  const { kpis } = stats;
  const allVs = stats.vsMains.map((m) => m.total).filter((t): t is NonNullable<typeof t> => !!t);
  const vsTarget = allVs.reduce((s, t) => s + t.targetMs, 0);
  const vsActual = allVs.reduce((s, t) => s + t.comparableMs, 0);

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
        <Kpi
          label="Zeit an Aufträgen"
          value={formatDuration(kpis.totalMs)}
          hint={kpis.reworkMs > 0 ? `davon Nacharbeit ${formatDuration(kpis.reworkMs)}` : undefined}
        />
        <Kpi
          label="Arbeitsbilanz"
          value={vsTarget ? formatBalance(balanceMs(vsActual, vsTarget)) : '–'}
          color={!vsTarget ? undefined : vsActual > vsTarget ? p.danger : p.success}
          hint={vsTarget ? `Soll ${formatDuration(vsTarget)} · Ist ${formatDuration(vsActual)}` : 'keine Vorgaben im Zeitraum'}
        />
        <Kpi label="Nacharbeit" value={formatDuration(kpis.reworkMs)} color={kpis.reworkMs > 0 ? p.warning : undefined} />
        <Kpi label="Aufträge" value={String(kpis.jobCount)} hint={`${allVs.reduce((s, t) => s + t.jobs, 0)} abgeschlossen`} />
      </View>

      {stats.praise && (
        <Card style={[styles.praise, { borderColor: p.success, backgroundColor: p.success + '14' }]}>
          <Ionicons name="trophy" size={22} color={p.success} />
          <Text style={{ color: p.text, fontWeight: '700', flex: 1 }}>{stats.praise}</Text>
        </Card>
      )}

      <Card>
        <BarChart data={stats.buckets} />
      </Card>

      <Expandable title="Aufträge: Ist gegen Soll" icon="git-compare-outline" initiallyOpen>
        {stats.orders.length === 0 ? (
          <Empty text="Keine abgeschlossenen Aufträge mit Vorgabe in diesem Zeitraum." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {stats.orders.slice(0, 30).map((o) => (
              <OrderVs key={o.key} name={o.name} shared={o.shared} c={o.comparison} />
            ))}
            <Text style={{ color: p.muted, fontSize: 12 }}>
              Ist = deine Arbeitszeit (Personenzeit). Soll = Vorgabe. Arbeiten mehrere am Auftrag, bekommst du die Vorgabe im
              Verhältnis deiner Arbeitszeit: z.B. 6 von 10 Stunden = 60 % → 60 % der Vorgabe. Bilanz = Soll − Ist
              (+ schneller, − länger als geplant).
            </Text>
          </View>
        )}
      </Expandable>

      <Expandable title="Vorgabe gegen Ist" icon="speedometer-outline" initiallyOpen>
        <Segmented
          options={[
            { value: 'device', label: 'Gesamtgeräte' },
            { value: 'part', label: 'Fronten' },
            { value: 'none', label: 'Sonstige' },
          ]}
          value={vsMain}
          onChange={setVsMain}
        />
        {(() => {
          const m = stats.vsMains.find((x) => x.main === vsMain)!;
          if (!m.total) return <Empty text="Keine abgeschlossenen Aufträge in diesem Zeitraum." />;
          return (
            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              {vsMain !== 'none' && (
                <VsTable
                  title="Untergruppen"
                  rows={m.subgroups}
                  nameOf={(key) => (key === '-' ? 'ohne Untergruppe' : (groups.byId.get(key)?.name ?? 'gelöscht'))}
                />
              )}
              <VsTable
                title="Artikel"
                rows={m.articles}
                nameOf={(key) => (key === '-' ? 'ohne Artikel' : articles.byId.get(key) ? articleLabel(articles.byId.get(key)!) : 'gelöscht')}
              />
              <Text style={{ color: p.muted, fontSize: 12 }}>
                Deine abgeschlossenen Aufträge im Zeitraum. Ist = Personenzeit (Timer lief × Personen) der Aufträge mit Vorgabe,
                Soll = Vorgabe (bei Zusammenarbeit dein Anteil), Bilanz = Soll − Ist: + schneller, − länger als geplant.
                Min/Stk = Ist geteilt durch Stückzahl. Zeiten anderer sind nicht einsehbar.
              </Text>
            </View>
          );
        })()}
      </Expandable>

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
        <Row label="Zeit an Aufträgen" value={formatDuration(kpis.totalMs)} />
        <Row label="Ø pro aktivem Tag" value={formatDuration(kpis.avgPerActiveDayMs)} />
        <Row label="Aktuelle Serie" value={days(stats.streak)} />
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

/** Tabelle Ist gegen Vorgabe (Untergruppen bzw. Artikel): Name in eigener Zeile, darunter die Zahlen */
function VsTable({ title, rows, nameOf }: { title: string; rows: ComparisonRow[]; nameOf: (key: string) => string }) {
  const p = usePalette();
  return (
    <View>
      <Text style={[styles.th, { color: p.text, fontSize: 14 }]}>{title}</Text>
      <View style={[styles.tableRow, { borderBottomColor: p.border }]}>
        <Text style={[styles.th, { color: p.muted, flex: 1 }]} />
        {['Ist', 'Soll', 'Bilanz', 'Min/Stk'].map((h) => (
          <Text key={h} style={[styles.vsNum, styles.th, { color: p.muted }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.key} style={[styles.vsRow, { borderBottomColor: p.border }]}>
          <Text style={{ color: p.text, fontWeight: '600' }} numberOfLines={1}>
            {nameOf(r.key)}
          </Text>
          <View style={styles.vsNums}>
            <Text style={{ color: p.muted, fontSize: 12, flex: 1 }} numberOfLines={2}>
              {r.jobs} Auftr.{r.pieces ? ` · ${r.pieces} Stk` : ''}
              {r.actualMs > r.comparableMs ? ` · ${formatDuration(r.actualMs - r.comparableMs)} ohne Vorgabe` : ''}
            </Text>
            <Text style={[styles.vsNum, { color: p.text }]}>{r.jobsWithTarget ? formatDuration(r.comparableMs) : formatDuration(r.actualMs)}</Text>
            <Text style={[styles.vsNum, { color: p.muted }]}>{r.jobsWithTarget ? formatDuration(r.targetMs) : '–'}</Text>
            <Text
              style={[styles.vsNum, { color: !r.jobsWithTarget ? p.muted : r.comparableMs > r.targetMs ? p.danger : p.success, fontWeight: '700' }]}
            >
              {r.jobsWithTarget ? formatBalance(balanceMs(r.comparableMs, r.targetMs)) : '–'}
            </Text>
            <Text style={[styles.vsNum, { color: p.text }]}>
              {r.pieces ? (r.actualMs / r.pieces / 60_000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) : '–'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Ein Auftrag: Ist und Soll als Balken, dazu Bilanz und – bei Zusammenarbeit – der eigene Anteil */
function OrderVs({ name, shared, c }: { name: string; shared: boolean; c: Comparison }) {
  const p = usePalette();
  const target = c.targetMs;
  const max = Math.max(c.actualMs, target ?? 0, 1);
  const over = target !== null && c.actualMs > target;
  return (
    <View style={[styles.vsRow, { borderBottomColor: p.border, gap: 4 }]}>
      <View style={styles.vsNums}>
        <Text style={{ color: p.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ color: target === null ? p.muted : over ? p.danger : p.success, fontWeight: '700' }}>
          {target === null ? 'keine Vorgabe' : `Bilanz ${formatBalance(balanceMs(c.actualMs, target))}`}
        </Text>
      </View>
      {shared && c.share !== undefined && (
        <Text style={{ color: p.muted, fontSize: 12 }}>
          Dein Anteil an der Arbeitszeit: {Math.round(c.share * 100)} %
          {c.orderTargetMs ? ` → ${Math.round(c.share * 100)} % von ${formatDuration(c.orderTargetMs)} Soll` : ''}
        </Text>
      )}
      <BarLine label="Ist" ms={c.actualMs} max={max} color={over ? p.danger : p.primary} />
      {target !== null && <BarLine label="Soll" ms={target} max={max} color={p.muted} />}
    </View>
  );
}

function BarLine({ label, ms, max, color }: { label: string; ms: number; max: number; color: string }) {
  const p = usePalette();
  return (
    <View style={styles.barLine}>
      <Text style={{ color: p.muted, fontSize: 12, width: 34 }}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: p.track }]}>
        <View style={{ width: `${Math.max(2, (ms / max) * 100)}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
      </View>
      <Text style={{ color: p.text, fontSize: 12, width: 64, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatDuration(ms)}</Text>
    </View>
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
  praise: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
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
  vsRow: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  vsNums: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  barLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barTrack: { flex: 1, height: 10, borderRadius: 4, overflow: 'hidden' },
  vsNum: { width: 58, textAlign: 'right', fontVariant: ['tabular-nums'], fontSize: 13 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
