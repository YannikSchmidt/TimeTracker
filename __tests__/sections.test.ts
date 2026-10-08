import { DEFAULT_CODE_PATTERNS } from '../src/domain/codes';
import { flowOf, hasSections, timeByStep, timeSinceStepChange } from '../src/domain/flows';
import { jobName } from '../src/domain/jobs';
import { articleForSection, compareOrder, orderArticle, orderKey, sameOrder, targetKey } from '../src/domain/targets';
import type { Article, Job } from '../src/domain/types';
import { createMemoryStore } from '../src/repositories/memory';

const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };
const MIN = 60_000;
const art = (extra: Partial<Article> = {}): Article => ({ id: 'a', number: '07123456', name: 'Kühlteil', device: '', groupId: null, targets: {}, ...meta, ...extra });
const job = (extra: Partial<Job> = {}): Job => ({
  id: 'j', kind: 'order', status: 'done', articleId: 'a', orderNo: '2612345', quantity: 10, note: '', valueIds: [],
  reworkReason: null, parentJobId: null, startedAt: 0, finishedAt: 1, createdBy: null, currentStep: null, onlyStep: null, ...meta, ...extra,
});

function store() {
  let id = 0;
  let clock = 1_000;
  const s = createMemoryStore({ makeId: () => `id${++id}`, now: () => clock });
  return { ...s, tick: (ms: number) => (clock += ms) };
}

describe('Gesamtgeräte: Display-Verheiratung und Gesamtmontage', () => {
  it('eigener Ablauf je Teil (Untergruppe, sonst Hauptgruppe); Fronten ohne Aufteilung', async () => {
    const s = store();
    await s.repos.groups.update('grp-device', { steps: ['Montage', 'Prüfen'], displaySteps: ['Display holen', 'Display verheiraten'] });
    const sub = await s.repos.groups.create({ main: 'device', name: 'Kühlschrank', parentId: 'grp-device', displaySteps: ['Kleben'] });
    const groups = new Map((await s.repos.groups.list()).map((g) => [g.id, g]));
    expect(flowOf(art(), groups, DEFAULT_CODE_PATTERNS, 'display').steps).toEqual(['Display holen', 'Display verheiraten']);
    expect(flowOf(art(), groups, DEFAULT_CODE_PATTERNS, 'assembly').steps).toEqual(['Montage', 'Prüfen']);
    expect(flowOf(art(), groups, DEFAULT_CODE_PATTERNS).steps).toEqual(['Montage', 'Prüfen']);
    expect(flowOf(art({ groupId: sub.id }), groups, DEFAULT_CODE_PATTERNS, 'display').steps).toEqual(['Kleben']);
    expect(flowOf(art({ groupId: sub.id }), groups, DEFAULT_CODE_PATTERNS, 'assembly').steps).toEqual(['Montage', 'Prüfen']);
    expect(hasSections(art(), groups, DEFAULT_CODE_PATTERNS)).toBe(true);
    expect(hasSections(art({ noSections: true }), groups, DEFAULT_CODE_PATTERNS)).toBe(false);
    expect(hasSections(art({ number: '5000001234' }), groups, DEFAULT_CODE_PATTERNS)).toBe(false);
  });

  it('Vorgabezeiten je Teil (Display mit Präfix), Vergleich nur mit dem eigenen Teil', () => {
    const a = art({ targets: { [targetKey('display', 'Kleben')]: { setup: 5, perPiece: 0 }, Montage: { setup: 20, perPiece: 0 } } });
    expect(articleForSection(a, 'display').targets).toEqual({ Kleben: { setup: 5, perPiece: 0 } });
    expect(articleForSection(a, 'assembly').targets).toEqual({ Montage: { setup: 20, perPiece: 0 } });
    expect(articleForSection(a, null).targets).toEqual({ Montage: { setup: 20, perPiece: 0 } });
    const d = job({ section: 'display' });
    const c = compareOrder([{ job: d, entries: [] }], orderArticle([d], new Map([['a', a]])), ['Kleben'], 0);
    expect(c.targetMs).toBe(5 * MIN);
  });

  it('eigenständige Aufträge: gleiche Nummer, aber anderer Teil zählt nicht zusammen', () => {
    const d = job({ id: 'j', section: 'display' });
    const m = job({ id: 'k', section: 'assembly' });
    const old = job({ id: 'o', section: null });
    expect(sameOrder(d, m)).toBe(false);
    expect(sameOrder(m, old)).toBe(true); // ohne Angabe = Gesamtmontage
    expect(sameOrder(d, job({ id: 'x', section: 'display' }))).toBe(true);
    expect(orderKey(d)).not.toBe(orderKey(m));
    expect(orderKey(m)).toBe(orderKey(old));
    expect(jobName(d, art())).toBe('2612345 · Kühlteil · Display');
    expect(jobName(m, art())).toBe('2612345 · Kühlteil · Gesamtmontage');
    expect(jobName(old, art())).toBe('2612345 · Kühlteil');
  });

  it('Teil wird mit dem Auftrag gespeichert', async () => {
    const s = store();
    const j = await s.repos.jobs.start({ orderNo: '2612345', section: 'display', currentStep: 'Kleben' });
    expect((await s.repos.jobs.get(j.id))?.section).toBe('display');
    const a = await s.repos.articles.create({ number: '07999999', name: '', device: '', noSections: true });
    expect((await s.repos.articles.get(a.id))?.noSections).toBe(true);
  });
});

describe('Bisherige Zeit übernehmen (#15)', () => {
  it('ohne Schritt gestartet: die ganze Zeit seit Start zählt zum gewählten Schritt, Timer läuft weiter', async () => {
    const s = store();
    const j = await s.repos.jobs.start({ orderNo: '2600001' });
    s.tick(10 * MIN);
    await s.repos.jobs.pause(j.id);
    await s.repos.jobs.resume(j.id);
    s.tick(5 * MIN);
    const before = (await s.repos.entries.listAll()).filter((e) => e.jobId === j.id);
    expect(timeSinceStepChange(before, null, 1_000 + 15 * MIN).ms).toBe(15 * MIN);
    await s.repos.jobs.relabelStep(j.id, 'Teile holen');
    const entries = (await s.repos.entries.listAll()).filter((e) => e.jobId === j.id);
    expect(timeByStep(entries, ['Teile holen'], 1_000 + 15 * MIN)).toEqual([{ step: 'Teile holen', ms: 15 * MIN }]);
    expect(entries.some((e) => e.endAt === null)).toBe(true);
    expect((await s.repos.jobs.get(j.id))).toMatchObject({ currentStep: 'Teile holen', status: 'running' });
  });

  it('nach einem Wechsel: nur die Zeit seit dem Wechsel wird übernommen', async () => {
    const s = store();
    const j = await s.repos.jobs.start({ orderNo: '2600002', currentStep: 'A' });
    s.tick(10 * MIN);
    await s.repos.jobs.nextStep(j.id, 'B');
    s.tick(4 * MIN);
    await s.repos.jobs.relabelStep(j.id, 'C');
    s.tick(MIN);
    const entries = (await s.repos.entries.listAll()).filter((e) => e.jobId === j.id);
    expect(timeByStep(entries, ['A', 'B', 'C'], 1_000 + 15 * MIN)).toEqual([
      { step: 'A', ms: 10 * MIN },
      { step: 'C', ms: 5 * MIN },
    ]);
  });
});
