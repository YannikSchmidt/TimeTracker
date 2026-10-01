import { addDays, format, startOfDay } from 'date-fns';

import type { Entry, Millis, Range } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Ende eines Eintrags; laufende Einträge enden „jetzt“. */
export function effectiveEnd(entry: Pick<Entry, 'endAt'>, now: Millis): Millis {
  return entry.endAt ?? now;
}

export function entryDuration(entry: Pick<Entry, 'startAt' | 'endAt'>, now: Millis): Millis {
  return Math.max(0, effectiveEnd(entry, now) - entry.startAt);
}

/** Schnittmenge zweier Intervalle in ms (0, wenn sie sich nicht überlappen). */
export function overlap(a: Range, b: Range): Millis {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function dayKey(ts: Millis): string {
  return format(ts, 'yyyy-MM-dd');
}

/**
 * Teilt ein Intervall an lokalen Mitternachtsgrenzen auf.
 * Liefert für jeden berührten Tag die darauf entfallende Dauer.
 */
export function splitByDay(interval: Range): { day: string; dayStart: Millis; ms: Millis }[] {
  const result: { day: string; dayStart: Millis; ms: Millis }[] = [];
  if (interval.end <= interval.start) return result;
  let dayStart = startOfDay(interval.start).getTime();
  while (dayStart < interval.end) {
    const next = addDays(dayStart, 1).getTime();
    const ms = overlap(interval, { start: dayStart, end: next });
    if (ms > 0) result.push({ day: dayKey(dayStart), dayStart, ms });
    dayStart = next;
  }
  return result;
}

/** 3725000 → "1:02:05" */
export function formatClock(ms: Millis): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 5400000 → "1h 30m", 600000 → "10m" */
export function formatDuration(ms: Millis): string {
  const sign = ms < 0 ? '-' : '';
  const totalMinutes = Math.round(Math.abs(ms) / MINUTE);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** Dezimalstunden, z.B. für Diagramm-Achsen und CSV. */
export function toHours(ms: Millis): number {
  return ms / HOUR;
}

export function formatTime(ts: Millis): string {
  return format(ts, 'HH:mm');
}
