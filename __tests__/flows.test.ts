import { DEFAULT_CODE_PATTERNS } from '../src/domain/codes';
import { cleanSteps, entryMs, flowOf, mainGroupOf, MAIN_GROUP_ID, nextStep, timeByStep } from '../src/domain/flows';
import type { Article, Entry } from '../src/domain/types';
import { mergeShared, splitSnapshot } from '../src/domain/merge';
import { createMemoryStore } from '../src/repositories/memory';

const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };
const art = (number: string, groupId: string | null = null): Article => ({ id: number || 'x', number, name: '', device: '', groupId, targets: {}, ...meta });

function store() {
  let id = 0;
  let clock = 1_000;
  const s = createMemoryStore({ makeId: () => `id${++id}`, now: () => clock });
  return { ...s, tick: (ms: number) => (clock += ms) };
}

describe('Abläufe', () => {
  it('Hauptgruppe aus Gruppe oder Artikelnummer', async () => {
    const s = store();
    const groups = new Map((await s.repos.groups.list()).map((g) => [g.id, g]));
    expect([...groups.keys()].sort()).toEqual(['grp-device', 'grp-part']);
    expect(mainGroupOf(art('07123456'), groups, DEFAULT_CODE_PATTERNS)).toBe('device');
    expect(mainGroupOf(art('5000001234'), groups, DEFAULT_CODE_PATTERNS)).toBe('part');
    expect(mainGroupOf(art(''), groups, DEFAULT_CODE_PATTERNS)).toBeNull();
    expect(mainGroupOf(art('', MAIN_GROUP_ID.part), groups, DEFAULT_CODE_PATTERNS)).toBe('part');
  });

  it('Untergruppe mit eigenem Ablauf, sonst Ablauf der Hauptgruppe', async () => {
    const s = store();
    await s.repos.groups.update('grp-device', { steps: ['Teile holen', ' Gesamtmontage ', '', 'teile holen', 'Prüfen'] });
    const sub = await s.repos.groups.create({ main: 'device', name: 'Kühlschrank', parentId: 'grp-device', steps: ['Teile holen', 'Kältekreis'] });
    const empty = await s.repos.groups.create({ main: 'device', name: 'Herd', parentId: 'grp-device' });
    expect(await s.repos.groups.create({ main: 'device', name: ' kühlschrank ', parentId: 'grp-device' })).toMatchObject({ id: sub.id });
    const groups = new Map((await s.repos.groups.list()).map((g) => [g.id, g]));
    expect(groups.get('grp-device')?.steps).toEqual(['Teile holen', 'Gesamtmontage', 'Prüfen']);
    expect(flowOf(art('07123456'), groups, DEFAULT_CODE_PATTERNS).steps).toEqual(['Teile holen', 'Gesamtmontage', 'Prüfen']);
    expect(flowOf(art('07123456', sub.id), groups, DEFAULT_CODE_PATTERNS)).toMatchObject({ main: 'device', subgroup: { name: 'Kühlschrank' }, steps: ['Teile holen', 'Kältekreis'] });
    expect(flowOf(art('07123456', empty.id), groups, DEFAULT_CODE_PATTERNS).steps).toEqual(['Teile holen', 'Gesamtmontage', 'Prüfen']);
    expect(flowOf(art('5000001234'), groups, DEFAULT_CODE_PATTERNS).steps).toEqual([]);
  });

  it('nächster Schritt, Zeit pro Schritt, Bereinigen', () => {
    const steps = ['A', 'B', 'C'];
    expect(nextStep(steps, 'A')).toBe('B');
    expect(nextStep(steps, 'C')).toBeNull();
    expect(nextStep(steps, 'X')).toBeNull();
    const e = (step: string | null, ms: number): Entry => ({ id: String(Math.random()), jobId: 'j', startAt: 0, endAt: ms, step, ...meta });
    expect(timeByStep([e('B', 5), e(null, 1), e('A', 2), e('B', 3), e('Z', 4)], steps, 0)).toEqual([
      { step: 'A', ms: 2 },
      { step: 'B', ms: 8 },
      { step: 'Z', ms: 4 },
      { step: null, ms: 1 },
    ]);
    expect(cleanSteps([' a', 'A', '', 'b '])).toEqual(['a', 'b']);
  });
});

describe('Timer mit Arbeitsschritten', () => {
  it('„Schritt fertig“ teilt die Zeit auf die Schritte auf; Pause/Weiter bleibt im Schritt', async () => {
    const s = store();
    const job = await s.repos.jobs.start({ orderNo: '2612345', currentStep: 'Teile holen' });
    s.tick(60_000);
    await s.repos.jobs.nextStep(job.id, 'Gesamtmontage');
    s.tick(30_000);
    await s.repos.jobs.pause(job.id);
    s.tick(10_000);
    await s.repos.jobs.resume(job.id);
    s.tick(20_000);
    await s.repos.jobs.finish(job.id);
    const entries = (await s.repos.entries.listAll()).filter((e) => e.jobId === job.id);
    expect(timeByStep(entries, ['Teile holen', 'Gesamtmontage'], 0)).toEqual([
      { step: 'Teile holen', ms: 60_000 },
      { step: 'Gesamtmontage', ms: 50_000 },
    ]);
    expect((await s.repos.jobs.get(job.id))?.currentStep).toBe('Gesamtmontage');
  });

  it('nur einen Schritt tracken; Schrittwechsel im Pausenzustand startet nichts', async () => {
    const s = store();
    const job = await s.repos.jobs.start({ orderNo: '2600001', onlyStep: 'Gesamtmontage' });
    expect(job).toMatchObject({ onlyStep: 'Gesamtmontage', currentStep: 'Gesamtmontage' });
    expect((await s.repos.entries.listAll())[0].step).toBe('Gesamtmontage');
    await s.repos.jobs.pause(job.id);
    await s.repos.jobs.nextStep(job.id, 'Prüfen');
    expect((await s.repos.jobs.get(job.id))?.status).toBe('paused');
    expect((await s.repos.entries.listAll()).length).toBe(1);
  });

  it('Gruppen landen im gemeinsamen Teil und Artikel merken sich ihre Gruppe', async () => {
    const s = store();
    const sub = await s.repos.groups.create({ main: 'part', name: 'Glasfront', parentId: 'grp-part', steps: ['Zuschnitt'] });
    const a = await s.repos.articles.create({ number: '5000001234', name: 'Front', device: '', groupId: sub.id });
    expect(a.groupId).toBe(sub.id);
    await s.repos.articles.update(a.id, { groupId: null });
    expect((await s.repos.articles.get(a.id))?.groupId).toBeNull();
    expect(s.snapshot().groups?.map((g) => g.name)).toContain('Glasfront');
  });
});

describe('Abgleich der Abläufe', () => {
  it('Untergruppen und Abläufe verschiedener Geräte werden zusammengeführt', async () => {
    const a = store();
    const b = store();
    await a.repos.groups.update('grp-device', { steps: ['Teile holen', 'Montage'] });
    const base = splitSnapshot(createMemoryStore({ makeId: () => 'x' }).snapshot(), 'x').shared;
    await b.repos.groups.create({ main: 'part', name: 'Glas', parentId: 'grp-part', steps: ['Zuschnitt'] });
    const merged = mergeShared(splitSnapshot(a.snapshot(), 'a').shared, splitSnapshot(b.snapshot(), 'b').shared, base);
    expect(merged.groups?.find((g) => g.id === 'grp-device')?.steps).toEqual(['Teile holen', 'Montage']);
    expect(merged.groups?.some((g) => g.name === 'Glas')).toBe(true);
    // ältere Dateien ohne Gruppen
    expect(mergeShared(splitSnapshot(a.snapshot(), 'a').shared, { version: 1, articles: [], dimensions: [], values: [] }, null).groups?.length).toBe(2);
  });
});

describe('Personenzähler im Timer', () => {
  it('Ändern teilt den laufenden Abschnitt, Pause/Weiter behält die Anzahl', async () => {
    const s = store();
    const job = await s.repos.jobs.start({ orderNo: '2612345', workers: 2 });
    s.tick(10 * 60_000);
    await s.repos.jobs.setWorkers(job.id, 3);
    s.tick(10 * 60_000);
    await s.repos.jobs.pause(job.id);
    await s.repos.jobs.resume(job.id);
    s.tick(5 * 60_000);
    await s.repos.jobs.setWorkers(job.id, 0); // wird auf 1 begrenzt
    s.tick(5 * 60_000);
    await s.repos.jobs.finish(job.id);
    const entries = (await s.repos.entries.listAll()).sort((a, b) => a.startAt - b.startAt);
    expect(entries.map((e) => e.workers)).toEqual([2, 3, 3, 1]);
    expect(entries.reduce((sum, e) => sum + entryMs(e, 0, true), 0)).toBe((20 + 30 + 15 + 5) * 60_000);
    expect((await s.repos.jobs.get(job.id))?.workers).toBe(1);
  });
});
