import { createMemoryRepositories } from '../src/repositories/memory';
import type { BackupData } from '../src/repositories/types';

function setup(initial?: BackupData | null) {
  let id = 0;
  let clock = 1_000;
  const saved: BackupData[] = [];
  const repos = createMemoryRepositories({
    initial,
    makeId: () => `id${++id}`,
    now: () => clock,
    persist: (s) => saved.push(s),
  });
  return { repos, saved, tick: (ms: number) => (clock += ms) };
}

it('legt Standard-Merkmale an', async () => {
  const { repos } = setup();
  const dims = await repos.dimensions.listDimensions();
  expect(dims.map((d) => [d.key, d.enabled])).toEqual([
    ['project', true],
    ['tags', true],
    ['person', false],
    ['order', false],
    ['type', false],
    ['label', false],
  ]);
});

it('Start stoppt laufenden Timer, Stop setzt Ende, Persistenz wird aufgerufen', async () => {
  const { repos, saved, tick } = setup();
  const a = await repos.entries.start({ note: 'A' });
  tick(5_000);
  const b = await repos.entries.start();
  expect((await repos.entries.get(a.id))?.endAt).toBe(6_000);
  expect((await repos.entries.getRunning())?.id).toBe(b.id);
  tick(1_000);
  await repos.entries.stop(b.id);
  expect(await repos.entries.getRunning()).toBeNull();
  expect(saved.length).toBe(3);
  expect(saved.at(-1)?.entries).toHaveLength(2);
});

it('listInRange, Validierung und Soft-Delete', async () => {
  const { repos } = setup();
  const e = await repos.entries.create({ startAt: 100, endAt: 200, note: '', valueIds: ['x', 'x'] });
  expect(e.valueIds).toEqual(['x']);
  expect(await repos.entries.listInRange(150, 300)).toHaveLength(1);
  expect(await repos.entries.listInRange(200, 300)).toHaveLength(0);
  await expect(repos.entries.create({ startAt: 200, endAt: 100, note: '', valueIds: [] })).rejects.toThrow();
  await expect(repos.entries.update(e.id, { endAt: 50 })).rejects.toThrow();
  await repos.entries.remove(e.id);
  expect(await repos.entries.listAll()).toHaveLength(0);
});

it('Werte, Einstellungen und Wiederherstellung aus gespeichertem Stand', async () => {
  const first = setup();
  const [project] = await first.repos.dimensions.listDimensions();
  const v = await first.repos.dimensions.createValue({ dimensionId: project.id, name: 'Kunde', color: '#f00' });
  await first.repos.dimensions.updateValue(v.id, { archived: true });
  await first.repos.settings.set({ weeklyTargetHours: 30 });
  await first.repos.entries.create({ startAt: 0, endAt: 10, note: 'n', valueIds: [v.id] });

  const second = setup(first.saved.at(-1));
  expect((await second.repos.dimensions.listValues())[0]).toMatchObject({ name: 'Kunde', archived: true });
  expect((await second.repos.settings.get()).weeklyTargetHours).toBe(30);
  expect((await second.repos.entries.listAll())[0].valueIds).toEqual([v.id]);
});

it('Backup-Import ordnet Standard-Merkmale per key zu', async () => {
  const source = setup();
  const [project] = await source.repos.dimensions.listDimensions();
  const v = await source.repos.dimensions.createValue({ dimensionId: project.id, name: 'P', color: '#000' });
  await source.repos.entries.create({ startAt: 0, endAt: 10, note: '', valueIds: [v.id] });
  const backup = await source.repos.exportBackup();

  let n = 0;
  const target = createMemoryRepositories({ makeId: () => `other${++n}` });
  await target.importBackup(backup);
  const dims = await target.dimensions.listDimensions();
  expect(dims).toHaveLength(6);
  const [value] = await target.dimensions.listValues();
  expect(value.dimensionId).toBe(dims[0].id);
  expect(await target.entries.listAll()).toHaveLength(1);
});
