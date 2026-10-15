import { maxWorkers, personSegments } from '../src/domain/jobs';
import { mergeShared, splitSnapshot } from '../src/domain/merge';
import { timeByStep } from '../src/domain/flows';
import { createMemoryStore } from '../src/repositories/memory';

const MIN = 60_000;
function store(owner = 'anna') {
  let id = 0;
  let clock = 1_000;
  const s = createMemoryStore({ makeId: () => `${owner}${++id}`, now: () => clock, owner: () => owner });
  return { ...s, tick: (ms: number) => (clock += ms) };
}

describe('Zeitübergabe an Mitarbeitende (#21, #23)', () => {
  it('k-te Person bekommt die Abschnitte mit mindestens k Personen; danach zählt der Auftrag 1 Person', async () => {
    const s = store();
    const j = await s.repos.jobs.start({ orderNo: '2600030', workers: 2, currentStep: 'A' });
    s.tick(60 * MIN);
    await s.repos.jobs.setWorkers(j.id, 3);
    s.tick(30 * MIN);
    await s.repos.jobs.finish(j.id);
    const entries = (await s.repos.entries.listAll()).filter((e) => e.jobId === j.id);
    expect(maxWorkers(entries)).toBe(3);
    expect(personSegments(entries, 2).reduce((t, x) => t + x.endAt - x.startAt, 0)).toBe(90 * MIN);
    expect(personSegments(entries, 3).reduce((t, x) => t + x.endAt - x.startAt, 0)).toBe(30 * MIN);
    await s.repos.jobs.setWorkersAll(j.id, 1);
    const after = (await s.repos.entries.listAll()).filter((e) => e.jobId === j.id);
    expect(after.every((e) => e.workers === 1)).toBe(true);
    expect((await s.repos.jobs.get(j.id))?.workers).toBe(1);
  });

  it('Übernehmen legt einen eigenen abgeschlossenen Auftrag an – mit oder ohne Schritte', async () => {
    const anna = store('anna');
    const h = await anna.repos.handovers.create({
      fromName: 'Anna', to: 'ben', toName: 'Ben', jobId: 'x', orderNo: '2600031', articleId: null, section: 'display', quantity: 4,
      label: '2600031', withSteps: false, segments: [{ startAt: 0, endAt: 30 * MIN, step: 'A' }, { startAt: 40 * MIN, endAt: 50 * MIN, step: 'B' }],
    });
    expect(h).toMatchObject({ from: 'anna', status: 'open' });
    const ben = store('ben');
    const job = await ben.repos.jobs.createFromHandover({ ...h, withSteps: true });
    expect(job).toMatchObject({ orderNo: '2600031', section: 'display', status: 'done', createdBy: 'ben', startedAt: 0, finishedAt: 50 * MIN });
    const mine = (await ben.repos.entries.listAll()).filter((e) => e.jobId === job.id);
    expect(timeByStep(mine, ['A', 'B'], 0)).toEqual([{ step: 'A', ms: 30 * MIN }, { step: 'B', ms: 10 * MIN }]);
    const plain = await ben.repos.jobs.createFromHandover(h);
    expect((await ben.repos.entries.listAll()).filter((e) => e.jobId === plain.id).every((e) => e.step === null)).toBe(true);
  });

  it('Übergaben stehen in der gemeinsamen Datei und werden zusammengeführt', async () => {
    const anna = store('anna');
    const h = await anna.repos.handovers.create({
      fromName: 'Anna', to: 'eva', toName: 'Eva', jobId: 'x', orderNo: null, articleId: null, section: null, quantity: null,
      label: 'x', withSteps: true, segments: [{ startAt: 0, endAt: MIN, step: null }],
    });
    const { shared } = splitSnapshot(anna.snapshot(), 'anna');
    expect(shared.handovers?.map((x) => x.id)).toEqual([h.id]);
    const accepted = { ...shared, handovers: shared.handovers!.map((x) => ({ ...x, status: 'accepted' as const, updatedAt: x.updatedAt + 1 })) };
    const merged = mergeShared(shared, accepted, shared);
    expect(merged.handovers?.[0].status).toBe('accepted');
  });
});
