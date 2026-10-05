import { DEFAULT_CODE_PATTERNS } from '../src/domain/codes';
import {
  bucketTotals,
  computeKpis,
  countWorkDays,
  currentStreak,
  hourProfile,
  periodLabel,
  periodRange,
  totalsByDimension,
  weekdayTotals,
} from '../src/domain/stats';
import type { Dimension, DimensionValue, Segment, Settings } from '../src/domain/types';

const H = 3_600_000;
const at = (s: string) => new Date(s).getTime();
const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };

let seq = 0;
function entry(start: string, end: string | null, valueIds: string[] = []): Segment {
  const id = `e${seq++}`;
  return {
    id,
    jobId: id,
    kind: 'order',
    jobStartedAt: at(start),
    startAt: at(start),
    endAt: end ? at(end) : null,
    step: null,
    note: '',
    valueIds,
    articleId: null,
    orderNo: null,
    quantity: null,
    ...meta,
  };
}

const settings: Settings = { weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], defaultQuantity: 24, codePatterns: DEFAULT_CODE_PATTERNS };

// Woche Mo 02.03.2026 – So 08.03.2026
const week = periodRange('week', at('2026-03-04T12:00'));

describe('periodRange', () => {
  it('Woche beginnt Montag', () => {
    expect(week.start).toBe(at('2026-03-02T00:00'));
    expect(week.end).toBe(at('2026-03-09T00:00'));
    expect(periodLabel('week', week)).toBe('KW 10 · 02.03. – 08.03.2026');
  });

  it('Monat und Jahr', () => {
    const month = periodRange('month', at('2026-02-15T10:00'));
    expect(month).toEqual({ start: at('2026-02-01T00:00'), end: at('2026-03-01T00:00') });
    expect(periodLabel('month', month)).toBe('Februar 2026');
    expect(periodRange('year', at('2026-07-01')).start).toBe(at('2026-01-01T00:00'));
  });
});

describe('bucketTotals', () => {
  it('summiert pro Tag inkl. leerer Tage und Mitternachts-Split', () => {
    const entries = [entry('2026-03-02T09:00', '2026-03-02T17:00'), entry('2026-03-03T23:00', '2026-03-04T02:00')];
    const buckets = bucketTotals(entries, week, 'day', at('2026-03-10T00:00'));
    expect(buckets).toHaveLength(7);
    expect(buckets.map((b) => b.ms / H)).toEqual([8, 1, 2, 0, 0, 0, 0]);
    expect(buckets[0].label).toBe('Mo 2.');
  });

  it('schneidet Einträge am Zeitraum ab', () => {
    const entries = [entry('2026-03-01T22:00', '2026-03-02T03:00')];
    expect(bucketTotals(entries, week, 'day', at('2026-03-10T00:00'))[0].ms).toBe(3 * H);
  });

  it('Monats-Buckets im Jahr', () => {
    const year = periodRange('year', at('2026-05-01'));
    const buckets = bucketTotals([entry('2026-01-31T22:00', '2026-02-01T02:00')], year, 'month', at('2027-01-01'));
    expect(buckets).toHaveLength(12);
    expect(buckets[0].ms).toBe(2 * H);
    expect(buckets[1].ms).toBe(2 * H);
  });
});

describe('computeKpis', () => {
  it('berechnet Gesamt, Durchschnitt, längste Session und Überstunden', () => {
    const entries = [
      entry('2026-03-02T08:00', '2026-03-02T18:00'), // 10h
      entry('2026-03-03T08:00', '2026-03-03T12:00'), // 4h
      entry('2026-03-03T13:00', '2026-03-03T17:00'), // 4h
    ];
    // "jetzt" = Mittwoch → Soll = Mo–Mi = 3 × 8h = 24h
    const k = computeKpis(entries, week, settings, at('2026-03-04T10:00'));
    expect(k.totalMs).toBe(18 * H);
    expect(k.jobCount).toBe(3);
    expect(k.reworkMs).toBe(0);
    expect(k.activeDays).toBe(2);
    expect(k.avgPerActiveDayMs).toBe(9 * H);
    expect(k.longestMs).toBe(10 * H);
    expect(k.targetMs).toBe(24 * H);
    expect(k.balanceMs).toBe(-6 * H);
  });

  it('zählt laufende Einträge bis jetzt und ignoriert gelöschte', () => {
    const running = entry('2026-03-02T08:00', null);
    const deleted = { ...entry('2026-03-02T01:00', '2026-03-02T05:00'), deletedAt: 1 };
    expect(computeKpis([running, deleted], week, settings, at('2026-03-02T09:30')).totalMs).toBe(1.5 * H);
  });

  it('Soll zählt nur Arbeitstage bis heute', () => {
    expect(countWorkDays(week, settings, at('2026-03-20'))).toBe(5);
    expect(countWorkDays(week, settings, at('2026-03-01'))).toBe(0);
    expect(countWorkDays(week, { ...settings, workDays: [6, 7] }, at('2026-03-20'))).toBe(2);
  });
});

describe('totalsByDimension', () => {
  const project: Dimension = { id: 'd1', key: 'project', name: 'Projekt', multi: false, enabled: true, sort: 0, ...meta };
  const tags: Dimension = { id: 'd2', key: 'tags', name: 'Tags', multi: true, enabled: true, sort: 1, ...meta };
  const values: DimensionValue[] = [
    { id: 'pA', dimensionId: 'd1', name: 'A', color: '#f00', archived: false, ...meta },
    { id: 'pB', dimensionId: 'd1', name: 'B', color: '#0f0', archived: false, ...meta },
    { id: 't1', dimensionId: 'd2', name: 'x', color: '#00f', archived: false, ...meta },
    { id: 't2', dimensionId: 'd2', name: 'y', color: '#0ff', archived: false, ...meta },
  ];
  const entries = [
    entry('2026-03-02T08:00', '2026-03-02T11:00', ['pA', 't1', 't2']),
    entry('2026-03-02T12:00', '2026-03-02T13:00', ['pB']),
    entry('2026-03-02T14:00', '2026-03-02T16:00', []),
  ];
  const now = at('2026-03-10');

  it('gruppiert nach Projekt, sortiert absteigend, inkl. "Ohne"', () => {
    const rows = totalsByDimension(entries, week, project, values, now);
    expect(rows.map((r) => [r.name, r.ms / H])).toEqual([
      ['A', 3],
      ['Ohne Projekt', 2],
      ['B', 1],
    ]);
  });

  it('zählt bei Mehrfach-Merkmalen für jeden Wert', () => {
    const rows = totalsByDimension(entries, week, tags, values, now);
    expect(rows.map((r) => [r.name, r.ms / H])).toEqual([
      ['x', 3],
      ['y', 3],
      ['Ohne Tags', 3],
    ]);
  });
});

describe('Profile & Streak', () => {
  it('hourProfile verteilt auf Stunden', () => {
    const hours = hourProfile([entry('2026-03-02T08:30', '2026-03-02T10:00')], week, at('2026-03-10'));
    expect(hours[8]).toBe(0.5 * H);
    expect(hours[9]).toBe(H);
    expect(hours.reduce((a, b) => a + b)).toBe(1.5 * H);
  });

  it('weekdayTotals: Index 0 = Montag', () => {
    const totals = weekdayTotals([entry('2026-03-08T10:00', '2026-03-08T12:00')], week, at('2026-03-10'));
    expect(totals[6]).toBe(2 * H);
  });

  it('currentStreak zählt zusammenhängende Tage, leerer heutiger Tag bricht nicht ab', () => {
    const entries = [
      entry('2026-03-01T10:00', '2026-03-01T11:00'),
      entry('2026-03-02T10:00', '2026-03-02T11:00'),
      entry('2026-03-03T10:00', '2026-03-03T11:00'),
    ];
    expect(currentStreak(entries, at('2026-03-03T20:00'))).toBe(3);
    expect(currentStreak(entries, at('2026-03-04T08:00'))).toBe(3);
    expect(currentStreak(entries, at('2026-03-05T08:00'))).toBe(0);
  });
});
