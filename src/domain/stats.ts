import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  getISODay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { de } from 'date-fns/locale';

import { dayKey, effectiveEnd, overlap, splitByDay } from './time';
import type { Dimension, DimensionValue, Entry, Millis, Range, Settings } from './types';

export type PeriodKind = 'week' | 'month' | 'year';
export type BucketUnit = 'day' | 'week' | 'month';

const WEEK_OPTS = { weekStartsOn: 1 as const };

// ---------------------------------------------------------------------------
// Zeiträume
// ---------------------------------------------------------------------------

function startOfUnit(unit: BucketUnit | PeriodKind, ts: Millis): Date {
  switch (unit) {
    case 'day':
      return startOfDay(ts);
    case 'week':
      return startOfWeek(ts, WEEK_OPTS);
    case 'month':
      return startOfMonth(ts);
    case 'year':
      return startOfYear(ts);
  }
}

function addUnit(unit: BucketUnit | PeriodKind, ts: Millis | Date, n: number): Date {
  switch (unit) {
    case 'day':
      return addDays(ts, n);
    case 'week':
      return addWeeks(ts, n);
    case 'month':
      return addMonths(ts, n);
    case 'year':
      return addYears(ts, n);
  }
}

export function periodRange(kind: PeriodKind, anchor: Millis): Range {
  const start = startOfUnit(kind, anchor);
  return { start: start.getTime(), end: addUnit(kind, start, 1).getTime() };
}

export function shiftAnchor(kind: PeriodKind, anchor: Millis, delta: number): Millis {
  return addUnit(kind, anchor, delta).getTime();
}

export function periodLabel(kind: PeriodKind, range: Range): string {
  switch (kind) {
    case 'week':
      return `KW ${format(range.start, 'I', { locale: de })} · ${format(range.start, 'dd.MM.')} – ${format(range.end - 1, 'dd.MM.yyyy')}`;
    case 'month':
      return format(range.start, 'LLLL yyyy', { locale: de });
    case 'year':
      return format(range.start, 'yyyy');
  }
}

/** Sinnvolle Balken-Auflösung für einen Zeitraum. */
export function defaultBucketUnit(kind: PeriodKind): BucketUnit {
  return kind === 'year' ? 'month' : 'day';
}

// ---------------------------------------------------------------------------
// Basis
// ---------------------------------------------------------------------------

export interface Clipped {
  entry: Entry;
  start: Millis;
  end: Millis;
}

/** Einträge auf den Zeitraum zuschneiden (laufende Einträge enden „jetzt“). */
export function clipEntries(entries: Entry[], range: Range, now: Millis): Clipped[] {
  const out: Clipped[] = [];
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    const start = Math.max(entry.startAt, range.start);
    const end = Math.min(effectiveEnd(entry, now), range.end);
    if (end > start) out.push({ entry, start, end });
  }
  return out;
}

export function totalMs(entries: Entry[], range: Range, now: Millis): Millis {
  return clipEntries(entries, range, now).reduce((sum, c) => sum + (c.end - c.start), 0);
}

/** Dauer pro Kalendertag (Schlüssel yyyy-MM-dd), über Mitternacht aufgeteilt. */
export function dailyTotals(entries: Entry[], range: Range, now: Millis): Map<string, Millis> {
  const totals = new Map<string, Millis>();
  for (const c of clipEntries(entries, range, now)) {
    for (const part of splitByDay(c)) {
      totals.set(part.day, (totals.get(part.day) ?? 0) + part.ms);
    }
  }
  return totals;
}

export interface Bucket {
  start: Millis;
  end: Millis;
  label: string;
  ms: Millis;
}

/** Summen pro Tag/Woche/Monat für jeden Abschnitt des Zeitraums (auch leere). */
export function bucketTotals(entries: Entry[], range: Range, unit: BucketUnit, now: Millis): Bucket[] {
  const clipped = clipEntries(entries, range, now);
  const buckets: Bucket[] = [];
  let cursor = startOfUnit(unit, range.start).getTime();
  while (cursor < range.end) {
    const next = addUnit(unit, cursor, 1).getTime();
    const bucketRange = { start: Math.max(cursor, range.start), end: Math.min(next, range.end) };
    const ms = clipped.reduce((sum, c) => sum + overlap(c, bucketRange), 0);
    buckets.push({ ...bucketRange, label: bucketLabel(unit, cursor), ms });
    cursor = next;
  }
  return buckets;
}

function bucketLabel(unit: BucketUnit, ts: Millis): string {
  switch (unit) {
    case 'day':
      return format(ts, 'EEEEEE d.', { locale: de });
    case 'week':
      return `KW${format(ts, 'I')}`;
    case 'month':
      return format(ts, 'LLL', { locale: de });
  }
}

// ---------------------------------------------------------------------------
// Verteilung nach Merkmal (Projekt, Person, …)
// ---------------------------------------------------------------------------

export interface DimensionShare {
  valueId: string | null;
  name: string;
  color: string;
  ms: Millis;
}

export const NONE_COLOR = '#9AA0A6';

/**
 * Zeit pro Wert eines Merkmals. Bei Mehrfach-Merkmalen (Tags) zählt die
 * Zeit eines Eintrags für jeden seiner Werte – die Summe kann dann größer
 * als die Gesamtzeit sein.
 */
export function totalsByDimension(
  entries: Entry[],
  range: Range,
  dimension: Dimension,
  values: DimensionValue[],
  now: Millis,
): DimensionShare[] {
  const ownValues = new Map(values.filter((v) => v.dimensionId === dimension.id).map((v) => [v.id, v]));
  const totals = new Map<string | null, Millis>();
  for (const c of clipEntries(entries, range, now)) {
    const ms = c.end - c.start;
    const matched = c.entry.valueIds.filter((id) => ownValues.has(id));
    const keys = matched.length > 0 ? (dimension.multi ? matched : [matched[0]]) : [null];
    for (const key of keys) totals.set(key, (totals.get(key) ?? 0) + ms);
  }
  return [...totals.entries()]
    .map(([valueId, ms]) => {
      const value = valueId ? ownValues.get(valueId) : undefined;
      return {
        valueId,
        name: value?.name ?? `Ohne ${dimension.name}`,
        color: value?.color ?? NONE_COLOR,
        ms,
      };
    })
    .sort((a, b) => b.ms - a.ms);
}

// ---------------------------------------------------------------------------
// Kennzahlen
// ---------------------------------------------------------------------------

/** Anzahl Arbeitstage im Zeitraum, nur bis einschließlich heute. */
export function countWorkDays(range: Range, settings: Settings, now: Millis): number {
  const until = Math.min(range.end, addDays(startOfDay(now), 1).getTime());
  let count = 0;
  for (let day = startOfDay(range.start).getTime(); day < until; day = addDays(day, 1).getTime()) {
    if (day >= range.start && settings.workDays.includes(getISODay(day))) count++;
  }
  return count;
}

export function targetMs(range: Range, settings: Settings, now: Millis): Millis {
  if (settings.workDays.length === 0) return 0;
  const perDay = (settings.weeklyTargetHours * 3_600_000) / settings.workDays.length;
  return countWorkDays(range, settings, now) * perDay;
}

export interface Kpis {
  totalMs: Millis;
  entryCount: number;
  activeDays: number;
  avgPerActiveDayMs: Millis;
  longestMs: Millis;
  targetMs: Millis;
  /** Ist minus Soll (positiv = Überstunden) */
  balanceMs: Millis;
}

export function computeKpis(entries: Entry[], range: Range, settings: Settings, now: Millis): Kpis {
  const clipped = clipEntries(entries, range, now);
  const total = clipped.reduce((sum, c) => sum + (c.end - c.start), 0);
  const activeDays = [...dailyTotals(entries, range, now).values()].filter((ms) => ms > 0).length;
  const target = targetMs(range, settings, now);
  return {
    totalMs: total,
    entryCount: clipped.length,
    activeDays,
    avgPerActiveDayMs: activeDays > 0 ? total / activeDays : 0,
    longestMs: clipped.reduce((max, c) => Math.max(max, c.end - c.start), 0),
    targetMs: target,
    balanceMs: total - target,
  };
}

/**
 * Anzahl aufeinanderfolgender Tage mit erfasster Zeit bis heute.
 * Ein heute noch leerer Tag unterbricht die Serie nicht.
 */
export function currentStreak(entries: Entry[], now: Millis): number {
  const days = new Set<string>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    for (const part of splitByDay({ start: e.startAt, end: effectiveEnd(e, now) })) days.add(part.day);
  }
  let cursor = startOfDay(now).getTime();
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1).getTime();
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1).getTime();
  }
  return streak;
}

/** Summe pro Stunde des Tages (Index 0–23): Wann wird gearbeitet? */
export function hourProfile(entries: Entry[], range: Range, now: Millis): Millis[] {
  const hours = new Array<Millis>(24).fill(0);
  for (const c of clipEntries(entries, range, now)) {
    let cursor = c.start;
    while (cursor < c.end) {
      const d = new Date(cursor);
      const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const segEnd = Math.min(nextHour, c.end);
      hours[d.getHours()] += segEnd - cursor;
      cursor = segEnd;
    }
  }
  return hours;
}

/** Summe pro Wochentag (Index 0 = Montag … 6 = Sonntag). */
export function weekdayTotals(entries: Entry[], range: Range, now: Millis): Millis[] {
  const totals = new Array<Millis>(7).fill(0);
  for (const c of clipEntries(entries, range, now)) {
    for (const part of splitByDay(c)) totals[getISODay(part.dayStart) - 1] += part.ms;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Artikel & Aufträge
// ---------------------------------------------------------------------------

export interface KeyTotal {
  key: string | null;
  ms: Millis;
}

/** Zeit gruppiert nach einem beliebigen Schlüssel (z.B. Auftragsnummer), absteigend sortiert. */
export function totalsByKey(
  entries: Entry[],
  range: Range,
  keyOf: (entry: Entry) => string | null,
  now: Millis,
): KeyTotal[] {
  const totals = new Map<string | null, Millis>();
  for (const c of clipEntries(entries, range, now)) {
    const key = keyOf(c.entry);
    totals.set(key, (totals.get(key) ?? 0) + (c.end - c.start));
  }
  return [...totals.entries()].map(([key, ms]) => ({ key, ms })).sort((a, b) => b.ms - a.ms);
}

export interface ArticleProduction {
  articleId: string;
  ms: Millis;
  /** Summe der Stückzahlen von Einträgen, die im Zeitraum begonnen haben */
  pieces: number;
  /** Zeit pro Stück, nur aus Einträgen mit Stückzahl > 0 */
  msPerPiece: Millis | null;
  entryCount: number;
}

/**
 * Zeit und Stück je Artikel. Die Zeit wird auf den Zeitraum zugeschnitten,
 * Stück zählen zum Startzeitpunkt des Eintrags.
 */
export function articleProduction(entries: Entry[], range: Range, now: Millis): ArticleProduction[] {
  const rows = new Map<string, ArticleProduction & { msWithPieces: Millis }>();
  for (const c of clipEntries(entries, range, now)) {
    const id = c.entry.articleId;
    if (!id) continue;
    const row = rows.get(id) ?? { articleId: id, ms: 0, pieces: 0, msPerPiece: null, entryCount: 0, msWithPieces: 0 };
    row.ms += c.end - c.start;
    row.entryCount++;
    const startsInRange = c.entry.startAt >= range.start && c.entry.startAt < range.end;
    if (startsInRange && c.entry.quantity) {
      row.pieces += c.entry.quantity;
      row.msWithPieces += entryDurationFull(c.entry, now);
    }
    rows.set(id, row);
  }
  return [...rows.values()]
    .map(({ msWithPieces, ...row }) => ({ ...row, msPerPiece: row.pieces > 0 ? msWithPieces / row.pieces : null }))
    .sort((a, b) => b.ms - a.ms);
}

function entryDurationFull(entry: Entry, now: Millis): Millis {
  return Math.max(0, effectiveEnd(entry, now) - entry.startAt);
}
