import { jobTimes, reworkOf, segmentsWithJob } from '../src/domain/jobs';
import { suggestQuantity } from '../src/domain/quantity';
import { articleProduction, reworkByReason, totalsByKey } from '../src/domain/stats';
import { frequentArticles, lastJobForOrder, recentOrders, reworkReasons } from '../src/domain/suggestions';
import type { Entry, Job } from '../src/domain/types';

const H = 3_600_000;
const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };
let seq = 0;

function job(extra: Partial<Job> = {}): Job {
  return {
    id: `j${seq++}`,
    kind: 'order',
    status: 'done',
    articleId: null,
    orderNo: null,
    quantity: null,
    note: '',
    valueIds: [],
    reworkReason: null,
    parentJobId: null,
    startedAt: 0,
    finishedAt: null,
    createdBy: null,
    ...meta,
    ...extra,
  };
}
const seg = (jobId: string, startAt: number, endAt: number | null): Entry => ({ id: `s${seq++}`, jobId, startAt, endAt, ...meta });

describe('jobTimes', () => {
  it('Arbeitszeit = Summe der Abschnitte, Gesamtzeit = erster Start bis Abschluss', () => {
    const j = job({ startedAt: 0, finishedAt: 5 * H });
    const entries = [seg(j.id, 0, 2 * H), seg(j.id, 3 * H, 5 * H), seg('other', 0, 9 * H)];
    expect(jobTimes(j, entries, 10 * H)).toMatchObject({ workMs: 4 * H, totalMs: 5 * H, pausedMs: H, runningSince: null });
  });

  it('laufender Auftrag zählt bis jetzt', () => {
    const j = job({ status: 'running', startedAt: 0 });
    const t = jobTimes(j, [seg(j.id, 0, H), seg(j.id, 2 * H, null)], 3 * H);
    expect(t).toMatchObject({ workMs: 2 * H, totalMs: 3 * H, runningSince: 2 * H });
  });

  it('pausierter Auftrag: Gesamtzeit läuft weiter bis jetzt', () => {
    const j = job({ status: 'paused', startedAt: 0 });
    expect(jobTimes(j, [seg(j.id, 0, H)], 4 * H)).toMatchObject({ workMs: H, totalMs: 4 * H });
  });
});

describe('Vorschläge', () => {
  const jobs = [
    job({ orderNo: 'A', articleId: 'x', startedAt: 1, quantity: 24 }),
    job({ orderNo: 'B', articleId: 'y', startedAt: 3 }),
    job({ orderNo: 'A', articleId: 'x', startedAt: 5, quantity: 30 }),
    job({ kind: 'rework', orderNo: 'A', reworkReason: 'Grat', startedAt: 6 }),
    job({ kind: 'rework', reworkReason: 'Maß', startedAt: 7 }),
    job({ kind: 'rework', reworkReason: 'Grat ', startedAt: 8 }),
    { ...job({ orderNo: 'Z', startedAt: 9 }), deletedAt: 1 },
  ];
  it('Aufträge nach Aktualität, Artikel nach Häufigkeit, Gründe nach Häufigkeit', () => {
    expect(recentOrders(jobs)).toEqual(['A', 'B']);
    expect(frequentArticles(jobs)).toEqual(['x', 'y']);
    expect(reworkReasons(jobs)).toEqual(['Grat', 'Maß']);
  });
  it('lastJobForOrder liefert den letzten Auftrag mit der Nummer', () => {
    expect(lastJobForOrder(jobs, ' A ')?.quantity).toBe(30);
    expect(lastJobForOrder(jobs, 'nix')).toBeNull();
  });
  it('suggestQuantity: häufigste Stückzahl, sonst Standard', () => {
    const more = [...jobs, job({ articleId: 'x', quantity: 24, startedAt: 2 })];
    expect(suggestQuantity(more, 'x', 10)).toEqual({ quantity: 24, source: 'history' });
    expect(suggestQuantity(jobs, 'x', 10).quantity).toBe(30); // Gleichstand → zuletzt verwendet
    expect(suggestQuantity(jobs, 'y', 10)).toEqual({ quantity: 10, source: 'default' });
    expect(suggestQuantity(jobs, null, 10).source).toBe('default');
  });
});

describe('Statistik auf Abschnitten', () => {
  const range = { start: 0, end: 10 * H };
  const a = job({ articleId: 'a', quantity: 24, orderNo: 'X', startedAt: 0 });
  const b = job({ articleId: 'a', quantity: 6, orderNo: 'Y', startedAt: 3 * H });
  const r = job({ kind: 'rework', parentJobId: a.id, articleId: 'a', orderNo: 'X', reworkReason: 'Grat', startedAt: 6 * H });
  const old = job({ articleId: 'a', quantity: 100, startedAt: -2 * H });
  const jobs = [a, b, r, old];
  const entries = [
    seg(a.id, 0, H), // Auftrag A mit Pause
    seg(a.id, 2 * H, 3 * H),
    seg(b.id, 3 * H, 4 * H),
    seg(r.id, 6 * H, 6.5 * H),
    seg(old.id, -2 * H, H), // begann vorher → Stück zählen nicht
  ];
  const segments = segmentsWithJob(entries, jobs);

  it('articleProduction: Stück einmal pro Auftrag, Nacharbeit getrennt', () => {
    const [row] = articleProduction(segments, range, 20 * H);
    expect(row.ms).toBe(4 * H);
    expect(row.reworkMs).toBe(0.5 * H);
    expect(row.pieces).toBe(30);
    expect(row.jobCount).toBe(3);
    expect(row.msPerPiece).toBe((3 * H) / 30);
  });

  it('totalsByKey nach Auftrag, reworkByReason, reworkOf', () => {
    expect(totalsByKey(segments, range, (s) => s.orderNo, 20 * H)).toEqual([
      { key: 'X', ms: 2.5 * H },
      { key: 'Y', ms: H },
      { key: null, ms: H },
    ]);
    expect(reworkByReason(segments, jobs, range, 20 * H)).toEqual([{ key: 'Grat', ms: 0.5 * H }]);
    expect(reworkOf(a.id, jobs, entries, 20 * H).map((x) => x.workMs)).toEqual([0.5 * H]);
  });
});
