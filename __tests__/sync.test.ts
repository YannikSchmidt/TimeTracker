import { fixSingleRunning, mergeById, normalizeShared } from '../src/domain/merge';
import type { Entry, Job } from '../src/domain/types';
import { createMemoryStore } from '../src/repositories/memory';
import { createTeamMeta, decryptJson, encryptJson, unlockTeam, WrongPasswordError } from '../src/sync/crypto';
import { PATHS, SyncEngine, type SyncStatus, type TeamMember } from '../src/sync/engine';
import { memoryRemote, type RemoteFile } from '../src/sync/remote';

const ITER = 1_000; // schnell für Tests (App: 600 000)
const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };

describe('Verschlüsselung', () => {
  it('Roundtrip, Prüfung des Passworts, Chiffretext enthält keinen Klartext', async () => {
    const { meta: m, key } = await createTeamMeta('geheim123', ITER);
    const text = await encryptJson(key, { orderNo: 'A-4711' });
    expect(text).not.toContain('A-4711');
    const key2 = await unlockTeam(m, 'geheim123');
    expect(await decryptJson(key2, text)).toEqual({ orderNo: 'A-4711' });
    await expect(unlockTeam(m, 'falsch')).rejects.toBeInstanceOf(WrongPasswordError);
  });
});

describe('Zusammenführen', () => {
  const v = (id: string, updatedAt: number, deletedAt: number | null = null) => ({ id, updatedAt, deletedAt, createdAt: 0 });
  it('neuere Änderung gewinnt, Löschung gewinnt immer', () => {
    const merged = mergeById([v('a', 5), v('b', 1), v('c', 9)], [v('a', 3), v('b', 2), v('c', 1, 1), v('d', 1)]);
    const byId = Object.fromEntries(merged.map((x) => [x.id, x]));
    expect(byId.a.updatedAt).toBe(5);
    expect(byId.b.updatedAt).toBe(2);
    expect(byId.c.deletedAt).toBe(1);
    expect(byId.d).toBeDefined();
  });

  it('fixSingleRunning: nur der zuletzt gestartete läuft', () => {
    const job = (id: string): Job => ({
      id, kind: 'order', status: 'running', articleId: null, orderNo: null, quantity: null, note: '', valueIds: [],
      reworkReason: null, parentJobId: null, startedAt: 0, finishedAt: null, createdBy: 'x', ...meta,
    });
    const entry = (id: string, jobId: string, startAt: number): Entry => ({ id, jobId, startAt, endAt: null, ...meta });
    const r = fixSingleRunning([job('A'), job('B')], [entry('e1', 'A', 100), entry('e2', 'B', 200)], 300);
    expect(r.jobs.map((j) => j.status)).toEqual(['paused', 'running']);
    expect(r.entries.find((e) => e.id === 'e1')?.endAt).toBe(200);
    expect(r.entries.find((e) => e.id === 'e2')?.endAt).toBeNull();
  });

  it('normalizeShared: doppelte Standard-Merkmale werden zusammengelegt', () => {
    const dim = (id: string, key: string, createdAt: number) => ({ id, key, name: key, multi: false, enabled: true, sort: 0, ...meta, createdAt });
    const s = normalizeShared({
      version: 1,
      articles: [],
      dimensions: [dim('dim-project', 'project', 5), dim('random', 'project', 1), dim('custom_x', 'custom_x', 1)],
      values: [{ id: 'v', dimensionId: 'random', name: 'Kunde', color: '#000', archived: false, ...meta }],
    });
    expect(s.dimensions.map((d) => d.id)).toEqual(['dim-project', 'custom_x']);
    expect(s.values[0].dimensionId).toBe('dim-project');
  });
});

/** Ein „Gerät“: lokaler Speicher + Sync-Engine gegen gemeinsames Remote. */
async function device(login: string, files: Map<string, RemoteFile>, key: CryptoKey, clock: { t: number }) {
  let n = 0;
  const store = createMemoryStore({ makeId: () => `${login}-${++n}-${Math.random().toString(36).slice(2, 6)}`, now: () => clock.t, owner: () => login });
  let team: TeamMember[] = [];
  let status: SyncStatus | null = null;
  const remote = memoryRemote(login, files);
  const engine = new SyncEngine({
    remote,
    key,
    login,
    getLocal: () => store.snapshot(),
    applyLocal: (d) => store.replace(d),
    onTeam: (m) => (team = m),
    onStatus: (s) => (status = s),
    now: () => clock.t,
  });
  return { store, repos: store.repos, engine, remote, team: () => team, status: () => status };
}

describe('Sync-Engine', () => {
  let key: CryptoKey;
  beforeAll(async () => {
    key = (await createTeamMeta('pw', ITER)).key;
  });

  it('zwei Personen: eigene Dateien, gemeinsame Artikel, fremde Aufträge nur lesbar sichtbar', async () => {
    const files = new Map<string, RemoteFile>();
    const clock = { t: 1_000 };
    const anna = await device('anna', files, key, clock);
    const ben = await device('ben', files, key, clock);

    const art = await anna.repos.articles.create({ number: '4711', name: 'Halter', device: '' });
    const job = await anna.repos.jobs.start({ orderNo: 'A-1', articleId: art.id, quantity: 24 });
    await anna.engine.sync();

    expect([...files.keys()].sort()).toEqual(['people/anna.enc', 'shared.enc']);
    for (const f of files.values()) expect(f.text).not.toMatch(/A-1|4711|Halter/);

    await ben.engine.sync();
    expect((await ben.repos.articles.list()).map((a) => a.number)).toEqual(['4711']);
    expect(await ben.repos.jobs.listAll()).toHaveLength(0); // fremde Aufträge landen nicht im eigenen Speicher
    expect(ben.team()).toHaveLength(1);
    expect(ben.team()[0]).toMatchObject({ login: 'anna' });
    expect(ben.team()[0].jobs[0]).toMatchObject({ id: job.id, orderNo: 'A-1', createdBy: 'anna' });
    expect(ben.status()?.state).toBe('idle');
  });

  it('zwei Geräte derselben Person: Änderungen werden zusammengeführt, Konflikt wird aufgelöst', async () => {
    const files = new Map<string, RemoteFile>();
    const clock = { t: 1_000 };
    const handy = await device('anna', files, key, clock);
    const tablet = await device('anna', files, key, clock);

    const a = await handy.repos.jobs.start({ orderNo: 'H' });
    await handy.engine.sync();
    await tablet.engine.sync();
    expect((await tablet.repos.jobs.listAll()).map((j) => j.orderNo)).toEqual(['H']);

    // Beide ändern offline, Tablet startet später einen zweiten Auftrag
    clock.t += 1_000;
    await handy.repos.jobs.update(a.id, { note: 'vom Handy' });
    clock.t += 1_000;
    const b = await tablet.repos.jobs.start({ orderNo: 'T' });

    await handy.engine.sync();
    await tablet.engine.sync(); // Datei hat sich geändert → zusammenführen
    await handy.engine.sync();

    for (const dev of [handy, tablet]) {
      const jobs = await dev.repos.jobs.listAll();
      expect(jobs.find((j) => j.id === a.id)).toMatchObject({ note: 'vom Handy', status: 'paused' });
      expect(jobs.find((j) => j.id === b.id)).toMatchObject({ status: 'running' });
      expect((await dev.repos.entries.listAll()).filter((e) => e.endAt === null)).toHaveLength(1);
    }
  });

  it('Konflikt beim Schreiben: Retry nach erneutem Laden', async () => {
    const files = new Map<string, RemoteFile>();
    const clock = { t: 1_000 };
    const anna = await device('anna', files, key, clock);
    await anna.repos.articles.create({ number: '1', name: '', device: '' });
    // Zwischen Lesen und Schreiben schreibt „jemand anderes“ shared.enc
    const origWrite = anna.remote.write.bind(anna.remote);
    let injected = false;
    anna.remote.write = async (path, text, sha, msg) => {
      if (path === PATHS.shared && !injected) {
        injected = true;
        const other = await encryptJson(key, {
          version: 1,
          articles: [{ id: 'x', number: '2', name: '', device: '', ...meta, updatedAt: 5 }],
          dimensions: [],
          values: [],
        });
        files.set(PATHS.shared, { sha: 'fremd', text: other });
      }
      return origWrite(path, text, sha, msg);
    };
    await anna.engine.sync();
    expect((await anna.repos.articles.list()).map((a) => a.number)).toEqual(['1', '2']);
    expect(anna.status()?.state).toBe('idle');
  });

  it('falscher Schlüssel → verständlicher Fehler', async () => {
    const files = new Map<string, RemoteFile>();
    const clock = { t: 1 };
    const anna = await device('anna', files, key, clock);
    await anna.engine.sync();
    const other = (await createTeamMeta('anderes', ITER)).key;
    const eve = await device('anna', files, other, clock);
    await eve.engine.sync();
    expect(eve.status()).toMatchObject({ state: 'error' });
    expect(eve.status()?.error).toMatch(/Passwort/);
  });
});
