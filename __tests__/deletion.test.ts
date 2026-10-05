import { mergeShared, splitSnapshot } from '../src/domain/merge';
import { createMemoryStore } from '../src/repositories/memory';

function store(owner: string) {
  let id = 0;
  let clock = 1_000;
  return {
    ...createMemoryStore({ makeId: () => `${owner}-${++id}`, now: () => (clock += 10), owner: () => owner }),
  };
}

describe('Löschvorschläge', () => {
  it('anlegen, entscheiden und im gemeinsamen Teil speichern', async () => {
    const ben = store('ben');
    const job = await ben.repos.jobs.start({ orderNo: '2612345' });
    const req = await ben.repos.requests.create({ kind: 'job', targetId: job.id, owner: 'ben', label: '2612345', reason: ' doppelt ' });
    expect(req).toMatchObject({ status: 'open', requestedBy: 'ben', decidedBy: null, reason: 'doppelt' });

    const shared = splitSnapshot(ben.snapshot(), 'ben').shared;
    expect(shared.deletionRequests?.map((r) => r.id)).toEqual([req.id]);

    // Admin bestätigt auf seinem Gerät → Abgleich bringt den Status zurück zu Ben
    const admin = store('yannikschmidt');
    admin.replace({ ...admin.snapshot(), deletionRequests: shared.deletionRequests });
    await admin.repos.requests.setStatus(req.id, 'approved');
    const fromAdmin = splitSnapshot(admin.snapshot(), 'yannikschmidt').shared;
    const merged = mergeShared(shared, fromAdmin, shared);
    expect(merged.deletionRequests?.[0]).toMatchObject({ status: 'approved', decidedBy: 'yannikschmidt', requestedBy: 'ben' });

    // Ben führt aus und markiert erledigt – decidedBy bleibt der Admin
    ben.replace({ ...ben.snapshot(), deletionRequests: merged.deletionRequests });
    await ben.repos.jobs.remove(job.id);
    await ben.repos.requests.setStatus(req.id, 'done');
    expect((await ben.repos.requests.list())[0]).toMatchObject({ status: 'done', decidedBy: 'yannikschmidt' });
    expect(await ben.repos.jobs.get(job.id)).toMatchObject({ deletedAt: expect.any(Number) });
  });

  it('Dateien älterer App-Versionen ohne Löschvorschläge bleiben lesbar', () => {
    const local = splitSnapshot(store('a').snapshot(), 'a').shared;
    const old = { version: 1 as const, articles: [], dimensions: [], values: [] };
    expect(mergeShared(local, old, null).deletionRequests).toEqual([]);
  });

  it('Artikel nur mit Bezeichnung (ohne Nummer)', async () => {
    const s = store('a');
    const a = await s.repos.articles.create({ number: '', name: 'Deckel rund', device: '' });
    const b = await s.repos.articles.create({ number: '', name: 'Deckel eckig', device: '' });
    expect(a.number).toBe('');
    expect(b.number).toBe('');
    expect(await s.repos.articles.findByNumber('')).toBeNull();
    await expect(s.repos.articles.create({ number: ' ', name: ' ', device: '' })).rejects.toThrow('Artikelnummer oder Benennung');
  });
});
