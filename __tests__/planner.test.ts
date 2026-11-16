import { pauseAtError, runningSince } from '../src/domain/jobs';
import { formatDecimal, normalizePlan, orderNumbers, planItemMs, planSummary, planTarget } from '../src/domain/planner';
import type { Article } from '../src/domain/types';
import { createMemoryStore } from '../src/repositories/memory';

const MIN = 60_000;
const HOUR = 60 * MIN;
function store() {
  let id = 0;
  let clock = 1_000_000;
  const s = createMemoryStore({ makeId: () => `x${++id}`, now: () => clock, owner: () => 'sergej' });
  return { ...s, tick: (ms: number) => (clock += ms), now: () => clock };
}

describe('Erinnerung bei langer Laufzeit (#27)', () => {
  it('runningSince zählt über Schrittwechsel hinweg, aber nicht über Pausen', async () => {
    const s = store();
    const j = await s.repos.jobs.start({ orderNo: '1', currentStep: 'A' });
    s.tick(30 * MIN);
    await s.repos.jobs.pause(j.id);
    s.tick(10 * MIN);
    await s.repos.jobs.resume(j.id);
    const resumedAt = s.now();
    s.tick(60 * MIN);
    await s.repos.jobs.nextStep(j.id, 'B');
    s.tick(60 * MIN);
    await s.repos.jobs.setWorkers(j.id, 2);
    s.tick(31 * MIN);
    const entries = await s.repos.entries.listAll();
    expect(runningSince(entries, s.now())).toBe(resumedAt);
    expect(s.now() - resumedAt).toBe(151 * MIN);
    await s.repos.jobs.pause(j.id);
    expect(runningSince(await s.repos.entries.listAll(), s.now())).toBeNull();
  });

  it('pauseAt kürzt den Lauf nachträglich und löscht spätere Abschnitte', async () => {
    const s = store();
    const j = await s.repos.jobs.start({ orderNo: '2', currentStep: 'A' });
    const start = s.now();
    s.tick(100 * MIN);
    await s.repos.jobs.nextStep(j.id, 'B');
    s.tick(51 * MIN);
    const at = s.now() - 60 * MIN; // vor 60 min aufgehört → liegt im Schritt A
    await s.repos.jobs.pauseAt(j.id, at);
    const live = (await s.repos.entries.listAll()).filter((e) => !e.deletedAt);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ step: 'A', startAt: start, endAt: at });
    expect((await s.repos.jobs.get(j.id))?.status).toBe('paused');
  });

  it('pauseAt lehnt Zeiten vor dem Lauf-Beginn, in der Zukunft und bei pausiertem Auftrag ab', async () => {
    const s = store();
    const j = await s.repos.jobs.start({ orderNo: '3' });
    const start = s.now();
    s.tick(10 * MIN);
    await expect(s.repos.jobs.pauseAt(j.id, start - MIN)).rejects.toThrow('vor dem Beginn');
    await expect(s.repos.jobs.pauseAt(j.id, s.now() + MIN)).rejects.toThrow('Zukunft');
    expect(pauseAtError(await s.repos.entries.listAll(), start + MIN, s.now())).toBeNull();
    await s.repos.jobs.pause(j.id);
    await expect(s.repos.jobs.pauseAt(j.id, start + MIN)).rejects.toThrow('läuft nicht');
  });

  it('Einstellung longRunMinutes wird gespeichert', async () => {
    const s = store();
    await s.repos.settings.set({ longRunMinutes: 120, planner: [{ articleId: 'a', quantity: 5 }] });
    expect(await s.repos.settings.get()).toMatchObject({ longRunMinutes: 120, planner: [{ articleId: 'a', quantity: 5 }] });
  });
});

function article(targets: Article['targets']): Article {
  return { id: 'a', number: '1', name: 'X', device: '', groupId: null, targets, createdAt: 0, updatedAt: 0, deletedAt: null } as Article;
}

describe('Planer (#28, #29)', () => {
  it('summiert die Vorgaben über den Ablauf, Gesamtgeräte mit beiden Teilen', () => {
    const a = article({ A: { setup: 10, perPiece: 2 }, B: { setup: 0, perPiece: 3 }, 'display:D': { setup: 5, perPiece: 1 } });
    const steps = (section: string | null) => (section === 'display' ? ['D'] : ['A', 'B']);
    const whole = planTarget(a, steps, true);
    expect(whole).toEqual({ setupMs: 15 * MIN, perPieceMs: 6 * MIN, hasTarget: true });
    expect(planTarget(a, steps, false)).toEqual({ setupMs: 10 * MIN, perPieceMs: 5 * MIN, hasTarget: true });
    expect(planItemMs(whole, 10)).toBe(75 * MIN);
    expect(planItemMs(whole, 0)).toBe(0);
    expect(planTarget(article({}), () => [], false).hasTarget).toBe(false);
    // ohne Ablauf gilt die Vorgabe für den ganzen Auftrag
    expect(planTarget(article({ '': { setup: 0, perPiece: 30 } }), () => [], false).perPieceMs).toBe(30 * MIN);
  });

  it('rechnet in Arbeitstage um, zieht die gearbeitete Zeit ab und sagt, wie viel noch passt', () => {
    const t1 = { setupMs: 30 * MIN, perPieceMs: 15 * MIN, hasTarget: true };
    const none = { setupMs: 0, perPieceMs: 0, hasTarget: false };
    const s = planSummary([{ target: t1, quantity: 30 }, { target: none, quantity: 5 }], 30, 5, 12 * HOUR);
    expect(s.totalMs).toBe(8 * HOUR); // 30 min + 30 × 15 min
    expect(s.hoursPerDay).toBe(6);
    expect(formatDecimal(s.days)).toBe('1,3');
    expect(s.freeMs).toBe(10 * HOUR);
    expect(s.fitsMore).toEqual([40, null]);
    const over = planSummary([{ target: t1, quantity: 100 }], 30, 5, 10 * HOUR);
    expect(over.freeMs).toBeLessThan(0);
    expect(over.fitsMore).toEqual([0]);
    // Zeile mit 0 Stück: Rüstzeit kommt noch dazu
    expect(planSummary([{ target: t1, quantity: 0 }], 1, 1, 0).fitsMore).toEqual([2]);
  });

  it('derselbe Artikel als mehrere Aufträge: jede Zeile zählt ihre Rüstzeit', () => {
    const t = { setupMs: 30 * MIN, perPieceMs: 15 * MIN, hasTarget: true };
    const two = planSummary([{ target: t, quantity: 30 }, { target: t, quantity: 30 }], 30, 5, 0);
    const one = planSummary([{ target: t, quantity: 60 }], 30, 5, 0);
    expect(two.totalMs).toBe(16 * HOUR);
    expect(two.totalMs - one.totalMs).toBe(30 * MIN);
  });

  it('ältere Listen ohne Zeilen-ID bekommen eindeutige IDs; Auftragsnummern nur bei Mehrfach-Artikeln', () => {
    const items = normalizePlan([{ articleId: 'a', quantity: 1 }, { articleId: 'a', quantity: 2 }, { id: 'x', articleId: 'b', quantity: 3 }]);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
    expect(items[2].id).toBe('x');
    expect(orderNumbers(items)).toEqual([1, 2, null]);
    expect(normalizePlan(undefined)).toEqual([]);
  });
});
