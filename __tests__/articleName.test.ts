import { jobName } from '../src/domain/jobs';
import { upgradeBackup, normalizeArticle, type BackupData } from '../src/domain/legacy';
import { normalizeShared } from '../src/domain/merge';
import type { Article } from '../src/domain/types';
import { articleDetails, findArticleByName, matchArticles } from '../src/hooks/useArticles';

const meta = { createdAt: 0, updatedAt: 7, deletedAt: null };
const art = (number: string, name: string, device = '', id = number): Article => ({ id, number, name, device, groupId: null, targets: {}, ...meta });

describe('normalizeArticle', () => {
  it('übernimmt die alte Bezeichnung in die Benennung', () => {
    const old = { id: 'a', number: '1', name: '', description: 'Halter links', ...meta } as unknown as Article;
    expect(normalizeArticle(old)).toEqual({ id: 'a', number: '1', name: 'Halter links', device: '', groupId: null, targets: {}, ...meta });
  });

  it('verbindet Name und Bezeichnung, gleiche Texte nur einmal', () => {
    const both = { ...art('1', 'Halter'), description: 'Stahl verzinkt' };
    expect(normalizeArticle(both).name).toBe('Halter – Stahl verzinkt');
    expect(normalizeArticle({ ...art('1', 'Halter'), description: 'Halter' }).name).toBe('Halter');
  });

  it('lässt aktuelle Artikel unverändert (gleiches Objekt)', () => {
    const a = art('1', 'Halter', 'Pumpe');
    expect(normalizeArticle(a)).toBe(a);
  });

  it('wird beim Laden alter Stände und gemeinsamer Daten angewendet', () => {
    const old = { id: 'a', number: '1', name: 'X', description: 'Y', ...meta } as unknown as Article;
    const data = { version: 2, exportedAt: 0, jobs: [], entries: [], dimensions: [], values: [], articles: [old], settings: {} };
    expect(upgradeBackup(data as unknown as BackupData).articles[0]).toMatchObject({ name: 'X – Y', device: '' });
    expect(normalizeShared({ version: 1, articles: [old], dimensions: [], values: [] }).articles[0]).not.toHaveProperty('description');
  });
});

describe('Artikelsuche', () => {
  const list = [art('4711-200', 'Halter links', 'Pumpe P3'), art('1200', 'Deckel'), art('900', 'Winkel 1200', 'Halter-Station')];

  it('findet nach Nummer, Benennung und Endgerät; Nummer zuerst', () => {
    expect(matchArticles(list, 'halter').map((a) => a.number)).toEqual(['4711-200', '900']);
    expect(matchArticles(list, '1200').map((a) => a.number)).toEqual(['1200', '900']);
    expect(matchArticles(list, 'pumpe').map((a) => a.number)).toEqual(['4711-200']);
    expect(matchArticles(list, 'links').map((a) => a.number)).toEqual(['4711-200']);
  });

  it('Benennung exakt und eindeutig', () => {
    expect(findArticleByName(list, ' halter LINKS ')?.number).toBe('4711-200');
    expect(findArticleByName(list, 'Halter')).toBeNull();
    expect(findArticleByName([...list, art('5', 'Deckel', '', 'x')], 'Deckel')).toBeNull();
  });

  it('Detailzeile ohne doppelte Benennung', () => {
    expect(articleDetails(list[0])).toEqual(['Art. 4711-200', 'Pumpe P3']);
    expect(articleDetails(art('77', ''))).toEqual([]);
  });
});

describe('jobName', () => {
  const a = art('4711', 'Halter links');
  it('Auftragsnummer und Benennung', () => {
    expect(jobName({ kind: 'order', orderNo: 'A-2026-0815' }, a)).toBe('A-2026-0815 · Halter links');
    expect(jobName({ kind: 'order', orderNo: 'A-1' }, null)).toBe('A-1');
    expect(jobName({ kind: 'order', orderNo: null }, a)).toBe('Halter links');
    expect(jobName({ kind: 'order', orderNo: 'A-1' }, art('4711', ''))).toBe('A-1 · 4711');
    expect(jobName({ kind: 'order', orderNo: null }, null)).toBe('Ohne Auftragsnummer');
  });
  it('Nacharbeit', () => {
    expect(jobName({ kind: 'rework', orderNo: 'A-1' }, a)).toBe('Nacharbeit · A-1 · Halter links');
    expect(jobName({ kind: 'rework', orderNo: null }, null)).toBe('Nacharbeit');
  });
});
