import { entryDuration, formatClock, formatDuration, splitByDay } from '../src/domain/time';

const at = (s: string) => new Date(s).getTime();

describe('splitByDay', () => {
  it('lässt ein Intervall innerhalb eines Tages unverändert', () => {
    expect(splitByDay({ start: at('2026-03-02T08:00'), end: at('2026-03-02T12:30') })).toEqual([
      { day: '2026-03-02', dayStart: at('2026-03-02T00:00'), ms: 4.5 * 3_600_000 },
    ]);
  });

  it('teilt an Mitternacht auf', () => {
    const parts = splitByDay({ start: at('2026-03-02T22:00'), end: at('2026-03-03T01:00') });
    expect(parts.map((p) => [p.day, p.ms / 3_600_000])).toEqual([
      ['2026-03-02', 2],
      ['2026-03-03', 1],
    ]);
  });

  it('behandelt die Zeitumstellung (23-Stunden-Tag) korrekt', () => {
    // 29.03.2026: Sommerzeitbeginn in Europe/Berlin
    const parts = splitByDay({ start: at('2026-03-29T00:00'), end: at('2026-03-30T00:00') });
    expect(parts).toHaveLength(1);
    expect(parts[0].ms).toBe(23 * 3_600_000);
  });

  it('liefert nichts für leere Intervalle', () => {
    expect(splitByDay({ start: 10, end: 10 })).toEqual([]);
  });
});

describe('Formatierung', () => {
  it('formatClock', () => {
    expect(formatClock(0)).toBe('0:00:00');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('formatDuration', () => {
    expect(formatDuration(10 * 60_000)).toBe('10m');
    expect(formatDuration(2 * 3_600_000)).toBe('2h');
    expect(formatDuration(5_400_000)).toBe('1h 30m');
    expect(formatDuration(-5_400_000)).toBe('-1h 30m');
  });
});

describe('entryDuration', () => {
  it('rechnet laufende Einträge bis jetzt', () => {
    expect(entryDuration({ startAt: 1000, endAt: null }, 4000)).toBe(3000);
    expect(entryDuration({ startAt: 1000, endAt: 2000 }, 4000)).toBe(1000);
  });
});
