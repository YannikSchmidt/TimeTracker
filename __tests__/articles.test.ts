import { suggestQuantity } from '../src/domain/quantity';
import { articleProduction, totalsByKey } from '../src/domain/stats';
import type { Entry } from '../src/domain/types';
import { createMemoryRepositories } from '../src/repositories/memory';

const H = 3_600_000;
const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };
let seq = 0;
function entry(startAt: number, endAt: number | null, extra: Partial<Entry> = {}): Entry {
  return { id: `e${seq++}`, startAt, endAt, note: '', valueIds: [], articleId: null, orderNo: null, quantity: null, ...meta, ...extra };
}

describe('suggestQuantity', () => {
  it('nutzt den Standard ohne Artikel oder Historie', () => {
    expect(suggestQuantity([], null, 24)).toEqual({ quantity: 24, source: 'default' });
    expect(suggestQuantity([entry(0, 1, { articleId: 'b', quantity: 10 })], 'a', 24)).toEqual({ quantity: 24, source: 'default' });
  });

  it('schlägt die häufigste Stückzahl vor', () => {
    const entries = [
      entry(1, 2, { articleId: 'a', quantity: 12 }),
      entry(2, 3, { articleId: 'a', quantity: 12 }),
      entry(3, 4, { articleId: 'a', quantity: 30 }),
      entry(4, 5, { articleId: 'a', quantity: null }),
      { ...entry(5, 6, { articleId: 'a', quantity: 30 }), deletedAt: 9 },
    ];
    expect(suggestQuantity(entries, 'a', 24)).toEqual({ quantity: 12, source: 'history' });
  });

  it('bei Gleichstand gewinnt die zuletzt genutzte', () => {
    const entries = [entry(1, 2, { articleId: 'a', quantity: 12 }), entry(5, 6, { articleId: 'a', quantity: 30 })];
    expect(suggestQuantity(entries, 'a', 24).quantity).toBe(30);
  });
});

describe('Artikel- und Auftragsstatistik', () => {
  const range = { start: 0, end: 10 * H };
  const entries = [
    entry(0, 2 * H, { articleId: 'a', quantity: 24, orderNo: 'X' }),
    entry(3 * H, 4 * H, { articleId: 'a', quantity: 6, orderNo: 'Y' }),
    entry(5 * H, 6 * H, { articleId: 'b', orderNo: 'X' }),
    entry(9 * H, 11 * H, { articleId: 'b', quantity: 10 }), // ragt aus dem Zeitraum
    entry(-2 * H, 1 * H, { articleId: 'a', quantity: 100 }), // begann vorher → Stück zählen nicht
  ];

  it('articleProduction summiert Zeit, Stück und Zeit/Stück', () => {
    const rows = articleProduction(entries, range, 20 * H);
    const a = rows.find((r) => r.articleId === 'a')!;
    expect(a.ms).toBe(4 * H);
    expect(a.pieces).toBe(30);
    expect(a.msPerPiece).toBe((3 * H) / 30);
    expect(a.entryCount).toBe(3);
    const b = rows.find((r) => r.articleId === 'b')!;
    expect(b.ms).toBe(2 * H);
    expect(b.pieces).toBe(10);
    expect(b.msPerPiece).toBe((2 * H) / 10);
  });

  it('totalsByKey gruppiert nach Auftrag', () => {
    expect(totalsByKey(entries, range, (e) => e.orderNo, 20 * H)).toEqual([
      { key: 'X', ms: 3 * H },
      { key: null, ms: 2 * H },
      { key: 'Y', ms: H },
    ]);
  });
});

describe('Artikel im Speicher-Repository', () => {
  const make = () => {
    let n = 0;
    return createMemoryRepositories({ makeId: () => `id${++n}` });
  };

  it('legt an, findet per Nummer, verhindert Duplikate', async () => {
    const r = make();
    const a = await r.articles.create({ number: ' 4711 ', name: 'Halter', description: 'Stahl' });
    expect(a.number).toBe('4711');
    expect((await r.articles.findByNumber('4711'))?.id).toBe(a.id);
    await expect(r.articles.create({ number: '4711', name: '', description: '' })).rejects.toThrow('gibt es bereits');
    await expect(r.articles.create({ number: '  ', name: '', description: '' })).rejects.toThrow();
    const b = await r.articles.create({ number: '0815', name: '', description: '' });
    await expect(r.articles.update(b.id, { number: '4711' })).rejects.toThrow();
    await r.articles.update(b.id, { name: 'Neu' });
    expect((await r.articles.get(b.id))?.name).toBe('Neu');
  });

  it('Start speichert Artikel/Auftrag/Stück; Löschen entfernt Zuordnung', async () => {
    const r = make();
    const a = await r.articles.create({ number: '1', name: '', description: '' });
    const e = await r.entries.start({ articleId: a.id, orderNo: 'A-1', quantity: 24 });
    expect(await r.entries.get(e.id)).toMatchObject({ articleId: a.id, orderNo: 'A-1', quantity: 24 });
    await expect(r.entries.start({ quantity: -1 })).rejects.toThrow();
    await r.articles.remove(a.id);
    expect((await r.entries.get(e.id))?.articleId).toBeNull();
    expect(await r.articles.list()).toHaveLength(0);
  });

  it('Backup-Import ordnet Artikel per Nummer zu; alte Stände bekommen Defaults', async () => {
    const source = make();
    const a = await source.articles.create({ number: '4711', name: 'Halter', description: '' });
    await source.entries.start({ articleId: a.id, quantity: 12 });
    const backup = await source.exportBackup();

    let n = 0;
    const target = createMemoryRepositories({ makeId: () => `t${++n}` });
    const local = await target.articles.create({ number: '4711', name: 'Lokal', description: '' });
    await target.importBackup(backup);
    expect(await target.articles.list()).toHaveLength(1);
    expect((await target.entries.listAll())[0].articleId).toBe(local.id);

    const legacy = { ...backup, articles: undefined, entries: backup.entries.map(({ articleId, orderNo, quantity, ...rest }) => rest as Entry) };
    const restored = createMemoryRepositories({ initial: legacy, makeId: () => 'x' });
    expect((await restored.entries.listAll())[0]).toMatchObject({ articleId: null, orderNo: null, quantity: null });
  });

  it('entfernt das alte, unbenutzte Merkmal „Auftrag“ aus gespeicherten Ständen', async () => {
    const old = await make().exportBackup();
    old.dimensions.push({ id: 'ord', key: 'order', name: 'Auftrag', multi: false, enabled: false, sort: 9, ...meta });
    const r = createMemoryRepositories({ initial: old, makeId: () => 'y' });
    expect((await r.dimensions.listDimensions()).map((d) => d.key)).not.toContain('order');
  });
});
