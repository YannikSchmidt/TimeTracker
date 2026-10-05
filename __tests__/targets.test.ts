import { cleanTargets, compareJob, compareJobs, deltaPct, formatPct, parseMinutes, stepTargetMs } from '../src/domain/targets';
import type { Article, Entry, Job } from '../src/domain/types';

const MIN = 60_000;
const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };
const article = (targets: Article['targets']): Article => ({ id: 'a', number: '07123456', name: '', device: '', groupId: null, targets, ...meta });
const job = (extra: Partial<Job> = {}): Job => ({
  id: 'j', kind: 'order', status: 'done', articleId: 'a', orderNo: '2612345', quantity: 10, note: '', valueIds: [],
  reworkReason: null, parentJobId: null, startedAt: 0, finishedAt: 1, createdBy: null, currentStep: null, onlyStep: null, ...meta, ...extra,
});
let n = 0;
const entry = (step: string | null, minutes: number): Entry => ({ id: `e${n++}`, jobId: 'j', startAt: 0, endAt: minutes * MIN, step, ...meta });

describe('Vorgabezeiten', () => {
  const a = article({ 'Teile holen': { setup: 5, perPiece: 0.5 }, Gesamtmontage: { setup: 10, perPiece: 3 } });
  const steps = ['Teile holen', 'Gesamtmontage', 'Prüfen'];

  it('Rüstzeit einmal, Einzelzeit × Stückzahl', () => {
    expect(stepTargetMs(a, 'Teile holen', 10)).toBe(10 * MIN);
    expect(stepTargetMs(a, 'Gesamtmontage', 10)).toBe(40 * MIN);
    expect(stepTargetMs(a, 'Prüfen', 10)).toBeNull();
    expect(stepTargetMs(a, 'Gesamtmontage', null)).toBe(13 * MIN);
  });

  it('Vergleich pro Schritt und gesamt', () => {
    const c = compareJob(job(), [entry('Teile holen', 8), entry('Gesamtmontage', 30), entry('Gesamtmontage', 20), entry('Prüfen', 4)], a, steps, 0);
    expect(c.actualMs).toBe(62 * MIN);
    expect(c.targetMs).toBe(50 * MIN);
    expect(c.deltaPct).toBe(24);
    expect(c.byStep).toEqual([
      { step: 'Teile holen', actualMs: 8 * MIN, targetMs: 10 * MIN },
      { step: 'Gesamtmontage', actualMs: 50 * MIN, targetMs: 40 * MIN },
      { step: 'Prüfen', actualMs: 4 * MIN, targetMs: null },
    ]);
  });

  it('nur ein Schritt bzw. ohne Ablauf der ganze Auftrag', () => {
    const only = compareJob(job({ onlyStep: 'Gesamtmontage' }), [entry('Gesamtmontage', 36)], a, steps, 0);
    expect(only).toMatchObject({ targetMs: 40 * MIN, deltaPct: -10 });
    const whole = compareJob(job({ quantity: 2 }), [entry(null, 30)], article({ '': { setup: 10, perPiece: 5 } }), [], 0);
    expect(whole).toMatchObject({ actualMs: 30 * MIN, targetMs: 20 * MIN, deltaPct: 50 });
    expect(compareJob(job(), [entry(null, 5)], article({}), [], 0).targetMs).toBeNull();
  });

  it('Zusammenfassen: Abweichung nur über Aufträge mit Vorgabe', () => {
    const rows = compareJobs(
      [
        { job: job({ id: '1', quantity: 10 }), comparison: { actualMs: 60 * MIN, targetMs: 50 * MIN, deltaPct: 20, byStep: [] } },
        { job: job({ id: '2', quantity: 5 }), comparison: { actualMs: 40 * MIN, targetMs: null, deltaPct: null, byStep: [] } },
        { job: job({ id: '3', articleId: 'b', quantity: 1 }), comparison: { actualMs: 10 * MIN, targetMs: null, deltaPct: null, byStep: [] } },
      ],
      (j) => j.articleId ?? '-',
    );
    expect(rows[0]).toMatchObject({ key: 'a', jobs: 2, pieces: 15, actualMs: 100 * MIN, targetMs: 50 * MIN, comparableMs: 60 * MIN, deltaPct: 20 });
    expect(rows[1]).toMatchObject({ key: 'b', deltaPct: null });
  });

  it('Eingaben und Anzeige', () => {
    expect(parseMinutes('1,5')).toBe(1.5);
    expect(parseMinutes('abc')).toBe(0);
    expect(formatPct(12)).toBe('+12 %');
    expect(formatPct(-5)).toBe('−5 %');
    expect(formatPct(null)).toBe('–');
    expect(deltaPct(10, null)).toBeNull();
    expect(cleanTargets({ a: { setup: 0, perPiece: 0 }, b: { setup: -1, perPiece: 2 } })).toEqual({ b: { setup: 0, perPiece: 2 } });
  });
});
