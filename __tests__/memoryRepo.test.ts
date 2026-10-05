import { DEFAULT_CODE_PATTERNS } from '../src/domain/codes';
import { createMemoryRepositories } from '../src/repositories/memory';
import type { BackupData, LegacyBackupData } from '../src/repositories/types';

function setup(initial?: BackupData | LegacyBackupData | null) {
  let id = 0;
  let clock = 1_000;
  const saved: BackupData[] = [];
  const repos = createMemoryRepositories({
    initial,
    makeId: () => `id${++id}`,
    now: () => clock,
    persist: (s) => saved.push(s),
  });
  return { repos, saved, tick: (ms: number) => (clock += ms), time: () => clock };
}

it('legt Standard-Merkmale an', async () => {
  const { repos } = setup();
  const dims = await repos.dimensions.listDimensions();
  expect(dims.map((d) => [d.key, d.enabled])).toEqual([
    ['project', true],
    ['tags', true],
    ['person', false],
    ['type', false],
    ['label', false],
  ]);
});

describe('Aufträge: mehrere offen, nur einer läuft', () => {
  it('Start pausiert den laufenden, Fortsetzen pausiert den anderen', async () => {
    const { repos, tick } = setup();
    const a = await repos.jobs.start({ orderNo: ' A-1 ', quantity: 24 });
    expect(a).toMatchObject({ status: 'running', orderNo: 'A-1', quantity: 24, kind: 'order' });
    tick(10_000);
    const b = await repos.jobs.start({ orderNo: 'B-2' });
    expect((await repos.jobs.get(a.id))?.status).toBe('paused');
    expect((await repos.jobs.get(b.id))?.status).toBe('running');
    tick(5_000);
    await repos.jobs.resume(a.id);
    expect((await repos.jobs.get(a.id))?.status).toBe('running');
    expect((await repos.jobs.get(b.id))?.status).toBe('paused');
    const open = await repos.jobs.listOpen();
    expect(open.map((j) => j.id)).toEqual([a.id, b.id]); // laufender zuerst
    const running = (await repos.entries.listAll()).filter((e) => e.endAt === null);
    expect(running).toHaveLength(1);
    expect(running[0].jobId).toBe(a.id);
  });

  it('Pause und Beenden schließen den Abschnitt; Wieder öffnen', async () => {
    const { repos, tick, time } = setup();
    const a = await repos.jobs.start({});
    tick(1_000);
    await repos.jobs.pause(a.id);
    expect((await repos.jobs.get(a.id))?.status).toBe('paused');
    tick(5_000);
    await repos.jobs.resume(a.id);
    tick(2_000);
    await repos.jobs.finish(a.id);
    const done = await repos.jobs.get(a.id);
    expect(done).toMatchObject({ status: 'done', finishedAt: time() });
    expect(await repos.jobs.listOpen()).toHaveLength(0);
    const segs = (await repos.entries.listAll()).filter((e) => e.jobId === a.id);
    expect(segs).toHaveLength(2);
    expect(segs.every((e) => e.endAt !== null)).toBe(true);
    await repos.jobs.reopen(a.id);
    expect(await repos.jobs.get(a.id)).toMatchObject({ status: 'paused', finishedAt: null });
  });

  it('Nacharbeit mit Grund; Löschen entfernt auch Nacharbeit und Abschnitte', async () => {
    const { repos, tick } = setup();
    const a = await repos.jobs.start({ orderNo: 'A', articleId: 'art' });
    tick(1000);
    await repos.jobs.finish(a.id);
    const r = await repos.jobs.start({ kind: 'rework', parentJobId: a.id, orderNo: 'A', articleId: 'art' });
    tick(500);
    await repos.jobs.finish(r.id, { reworkReason: '  Grat entfernen ' });
    expect(await repos.jobs.get(r.id)).toMatchObject({ kind: 'rework', reworkReason: 'Grat entfernen', status: 'done' });
    await repos.jobs.remove(a.id);
    expect(await repos.jobs.listAll()).toHaveLength(0);
    expect(await repos.entries.listAll()).toHaveLength(0);
  });

  it('Manuell nachtragen, Abschnitt bearbeiten, Validierung', async () => {
    const { repos } = setup();
    const j = await repos.jobs.createManual({ orderNo: 'X', quantity: 10 }, 100, 500);
    expect(j).toMatchObject({ status: 'done', startedAt: 100, finishedAt: 500 });
    await expect(repos.jobs.createManual({}, 500, 100)).rejects.toThrow();
    await expect(repos.jobs.start({ quantity: -1 })).rejects.toThrow();
    const [seg] = await repos.entries.listAll();
    await repos.entries.update(seg.id, { startAt: 50 });
    expect((await repos.jobs.get(j.id))?.startedAt).toBe(50);
    await expect(repos.entries.update(seg.id, { endAt: 10 })).rejects.toThrow();
    await repos.jobs.update(j.id, { quantity: 12, note: 'n' });
    expect(await repos.jobs.get(j.id)).toMatchObject({ quantity: 12, note: 'n', orderNo: 'X' });
  });
});

it('Stand wird gespeichert und wiederhergestellt', async () => {
  const first = setup();
  const [project] = await first.repos.dimensions.listDimensions();
  const v = await first.repos.dimensions.createValue({ dimensionId: project.id, name: 'Kunde', color: '#f00' });
  await first.repos.settings.set({ weeklyTargetHours: 30 });
  await first.repos.jobs.start({ valueIds: [v.id, v.id], orderNo: 'A' });

  const second = setup(first.saved.at(-1));
  expect((await second.repos.settings.get()).weeklyTargetHours).toBe(30);
  const [job] = await second.repos.jobs.listOpen();
  expect(job).toMatchObject({ orderNo: 'A', status: 'running', valueIds: [v.id] });
});

it('alte Stände (Version 1) werden in Aufträge umgewandelt', async () => {
  const legacy: LegacyBackupData = {
    version: 1,
    exportedAt: 0,
    entries: [
      { id: 'e1', startAt: 0, endAt: 100, note: 'alt', valueIds: [], createdAt: 0, updatedAt: 0, deletedAt: null },
      { id: 'e2', startAt: 200, endAt: null, orderNo: 'R', quantity: 5, createdAt: 0, updatedAt: 0, deletedAt: null },
    ],
    dimensions: [],
    values: [],
    settings: { weeklyTargetHours: 40, workDays: [1], defaultQuantity: 24, codePatterns: DEFAULT_CODE_PATTERNS },
  };
  const { repos } = setup(legacy);
  const jobs = await repos.jobs.listAll();
  expect(jobs.find((j) => j.id === 'e1')).toMatchObject({ status: 'done', note: 'alt', articleId: null, quantity: null });
  expect(jobs.find((j) => j.id === 'e2')).toMatchObject({ status: 'running', orderNo: 'R', quantity: 5 });
  expect((await repos.entries.listAll()).map((e) => e.jobId).sort()).toEqual(['e1', 'e2']);
});

it('Backup-Import: Merkmale per key, Artikel per Nummer, nur ein laufender', async () => {
  const source = setup();
  const [project] = await source.repos.dimensions.listDimensions();
  const v = await source.repos.dimensions.createValue({ dimensionId: project.id, name: 'P', color: '#000' });
  const a = await source.repos.articles.create({ number: '4711', name: 'Halter', device: '' });
  await source.repos.jobs.start({ valueIds: [v.id], articleId: a.id });
  const backup = await source.repos.exportBackup();

  let n = 0;
  const target = createMemoryRepositories({ makeId: () => `t${++n}` });
  const local = await target.articles.create({ number: '4711', name: 'Lokal', device: '' });
  const own = await target.jobs.start({});
  await target.importBackup(backup);
  const dims = await target.dimensions.listDimensions();
  expect(dims).toHaveLength(5);
  expect((await target.dimensions.listValues())[0].dimensionId).toBe(dims[0].id);
  expect(await target.articles.list()).toHaveLength(1);
  const imported = (await target.jobs.listAll()).find((j) => j.id !== own.id)!;
  expect(imported).toMatchObject({ articleId: local.id, status: 'paused' });
  expect((await target.entries.listAll()).filter((e) => e.endAt === null)).toHaveLength(1);
});

it('Artikel: anlegen, Duplikate, Löschen entfernt Zuordnung', async () => {
  const { repos } = setup();
  const a = await repos.articles.create({ number: ' 4711 ', name: 'Halter', device: 'Pumpe P3' });
  expect(a.number).toBe('4711');
  await expect(repos.articles.create({ number: '4711', name: '', device: '' })).rejects.toThrow('gibt es bereits');
  const j = await repos.jobs.start({ articleId: a.id });
  await repos.articles.remove(a.id);
  expect((await repos.jobs.get(j.id))?.articleId).toBeNull();
});
