import { cleanTargets, compareJob, compareJobs, compareOrder, compareShare, deltaPct, formatPct, orderKey, parseMinutes, sameOrder, stepTargetMs, teamPraise, balanceMs, formatBalance, orderArticle } from '../src/domain/targets';
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

describe('Mehrere Personen', () => {
  const a = article({ '': { setup: 0, perPiece: 6 } }); // 6 min je Stück, Auftrag ohne Ablauf
  const e = (jobId: string, minutes: number, workers?: number): Entry => ({ id: `w${n++}`, jobId, startAt: 0, endAt: minutes * MIN, step: null, workers, ...meta });

  it('Personenzähler: Zeit zählt mal Personen', () => {
    const c = compareJob(job({ quantity: 10 }), [e('j', 20, 2), e('j', 10)], a, [], 0);
    expect(c.actualMs).toBe(50 * MIN);
    expect(c.targetMs).toBe(60 * MIN);
    expect(c.deltaPct).toBe(-17);
  });

  it('zwei Timer am selben Auftrag zählen zusammen, Vorgabe einmal (größte Stückzahl)', () => {
    const mine = job({ id: 'j', quantity: 10 });
    const theirs = job({ id: 'k', quantity: null, createdBy: 'max' });
    const c = compareOrder([{ job: mine, entries: [e('j', 30)] }, { job: theirs, entries: [e('k', 40)] }], a, [], 0);
    expect(c).toMatchObject({ actualMs: 70 * MIN, targetMs: 60 * MIN, deltaPct: 17 });
    expect(sameOrder(mine, theirs)).toBe(true);
    expect(sameOrder(mine, job({ id: 'x', orderNo: '2699999' }))).toBe(false);
    expect(sameOrder(mine, job({ id: 'r', kind: 'rework' }))).toBe(false);
    expect(orderKey(mine)).toBe(orderKey(theirs));
  });

  it('nur Schritt-Timer: Vorgabe nur für die getrackten Schritte', () => {
    const b = article({ A: { setup: 10, perPiece: 0 }, B: { setup: 20, perPiece: 0 } });
    const c = compareOrder(
      [
        { job: job({ id: 'j', onlyStep: 'B' }), entries: [{ ...e('j', 25), step: 'B' }] },
        { job: job({ id: 'k', onlyStep: 'A' }), entries: [{ ...e('k', 5), step: 'A' }] },
      ],
      b,
      ['A', 'B'],
      0,
    );
    expect(c.byStep.map((s) => s.step)).toEqual(['A', 'B']);
    expect(c).toMatchObject({ actualMs: 30 * MIN, targetMs: 30 * MIN, deltaPct: 0 });
  });

  it('Zusammenarbeit: Vorgabe im Verhältnis der geleisteten Zeit (8 h + 2 h, 15 h Vorgabe → 12 h + 3 h)', () => {
    const v = article({ '': { setup: 15 * 60, perPiece: 0 } });
    const parts = [
      { job: job({ id: 'j' }), entries: [e('j', 8 * 60)] },
      { job: job({ id: 'k', createdBy: 'max' }), entries: [e('k', 2 * 60)] },
    ];
    const anna = compareShare(parts, new Set(['j']), v, [], 0);
    const max = compareShare(parts, new Set(['k']), v, [], 0);
    expect(anna).toMatchObject({ actualMs: 8 * 60 * MIN, targetMs: 12 * 60 * MIN, deltaPct: -33 });
    expect(max).toMatchObject({ actualMs: 2 * 60 * MIN, targetMs: 3 * 60 * MIN, deltaPct: -33 });
    // allein am Auftrag: wie bisher
    expect(compareShare([parts[0]], new Set(['j']), v, [], 0)).toMatchObject(compareOrder([parts[0]], v, [], 0));
    // allein, mit Schritt, an dem noch nicht gearbeitet wurde: volle Vorgabe (wie compareOrder)
    const b = article({ A: { setup: 1, perPiece: 0 }, B: { setup: 2, perPiece: 0 } });
    const solo = [{ job: job({ id: 'j' }), entries: [{ ...e('j', 1), step: 'A' }] }];
    expect(compareShare(solo, new Set(['j']), b, ['A', 'B'], 0)).toMatchObject(compareOrder(solo, b, ['A', 'B'], 0));
  });

  it('Zusammenarbeit pro Schritt: jeder bekommt den Anteil des Schritts, an dem er gearbeitet hat', () => {
    const b = article({ A: { setup: 10, perPiece: 0 }, B: { setup: 30, perPiece: 0 } });
    const parts = [
      { job: job({ id: 'j' }), entries: [{ ...e('j', 10), step: 'A' }, { ...e('j', 20), step: 'B' }] },
      { job: job({ id: 'k' }), entries: [{ ...e('k', 20), step: 'B' }] },
    ];
    const c = compareShare(parts, new Set(['j']), b, ['A', 'B'], 0);
    expect(c.byStep).toEqual([
      { step: 'A', actualMs: 10 * MIN, targetMs: 10 * MIN },
      { step: 'B', actualMs: 20 * MIN, targetMs: 15 * MIN },
    ]);
    expect(c).toMatchObject({ actualMs: 30 * MIN, targetMs: 25 * MIN });
  });
});

describe('Team-Vergleich (nur positiv)', () => {
  const people = [
    { id: 'anna', actualMs: 80, targetMs: 100 },
    { id: 'ben', actualMs: 90, targetMs: 100 },
    { id: 'max', actualMs: 100, targetMs: 100 },
    { id: 'eva', actualMs: 130, targetMs: 100 },
  ];
  it('lobt die Schnellsten, sagt den Langsameren nichts', () => {
    expect(teamPraise('anna', people)).toMatch(/am schnellsten/);
    expect(teamPraise('ben', people)).toMatch(/zu den Schnelleren/);
    expect(teamPraise('max', people)).toBeNull();
    expect(teamPraise('eva', people)).toBeNull();
  });
  it('kein Vergleich ohne andere oder ohne Vorgabe', () => {
    expect(teamPraise('anna', people.slice(0, 1))).toBeNull();
    expect(teamPraise('anna', [people[0], { id: 'ben', actualMs: 50, targetMs: 0 }])).toBeNull();
    expect(teamPraise('nobody', people)).toBeNull();
  });
  it('Gleichstand: kein „am schnellsten“, bei allen gleich gar nichts', () => {
    const tie = [{ id: 'anna', actualMs: 80, targetMs: 100 }, { id: 'ben', actualMs: 80, targetMs: 100 }, { id: 'eva', actualMs: 120, targetMs: 100 }];
    expect(teamPraise('anna', tie)).toMatch(/zu den Schnelleren/);
    expect(teamPraise('anna', tie.slice(0, 2))).toBeNull();
  });
});

describe('Gemeinsamer Auftrag erkennen (Fehler „beide positiv, obwohl zusammen über Soll“)', () => {
  const e = (jobId: string, minutes: number): Entry => ({ id: `s${n++}`, jobId, startAt: 0, endAt: minutes * MIN, step: null, ...meta });
  it('gleiche Auftragsnummer reicht – auch wenn der Artikel doppelt angelegt wurde', () => {
    expect(sameOrder(job({ id: 'j', articleId: 'a' }), job({ id: 'k', articleId: 'a2' }))).toBe(true);
    expect(sameOrder(job({ id: 'j', orderNo: '2600001' }), job({ id: 'k', orderNo: '2600002' }))).toBe(false);
  });

  it('ohne Auftragsnummer: gleicher Artikel und gleichzeitig gearbeitet', () => {
    const a = job({ id: 'j', orderNo: null, startedAt: 0, finishedAt: 100 });
    expect(sameOrder(a, job({ id: 'k', orderNo: null, startedAt: 50, finishedAt: 200 }))).toBe(true);
    expect(sameOrder(a, job({ id: 'k', orderNo: null, startedAt: 150, finishedAt: 200 }))).toBe(false);
    expect(sameOrder(a, job({ id: 'k', orderNo: null, articleId: 'b', startedAt: 50, finishedAt: 200 }))).toBe(false);
  });

  it('beide zusammen über Soll → beide negative Bilanz (Vorgabe vom Artikel mit Vorgabezeiten)', () => {
    const withTargets = article({ '': { setup: 0, perPiece: 45 } }); // 10 Stk → 7,5 h
    const duplicate: Article = { ...article({}), id: 'a2' };
    const byId = new Map([[withTargets.id, withTargets], [duplicate.id, duplicate]]);
    const anna = job({ id: 'j', articleId: 'a2' });
    const ben = job({ id: 'k', articleId: 'a' });
    const parts = [
      { job: anna, entries: [e('j', 6 * 60)] },
      { job: ben, entries: [e('k', 4 * 60)] },
    ];
    const art = orderArticle([anna, ben], byId);
    expect(art?.id).toBe('a');
    const a = compareShare(parts, new Set(['j']), art, [], 0);
    const b = compareShare(parts, new Set(['k']), art, [], 0);
    expect(a).toMatchObject({ share: 0.6, targetMs: 4.5 * 60 * MIN, orderTargetMs: 7.5 * 60 * MIN });
    expect(b).toMatchObject({ share: 0.4, targetMs: 3 * 60 * MIN });
    expect(balanceMs(a.actualMs, a.targetMs!)).toBeLessThan(0);
    expect(balanceMs(b.actualMs, b.targetMs!)).toBeLessThan(0);
    expect(formatBalance(balanceMs(a.actualMs, a.targetMs!))).toBe('−1h 30m');
    expect(formatBalance(30 * MIN)).toBe('+30m');
  });
});
