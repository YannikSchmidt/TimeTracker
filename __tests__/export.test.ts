import { entriesToCsv } from '../src/domain/export';
import type { Article, Dimension, DimensionValue, Entry } from '../src/domain/types';

const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };
const at = (s: string) => new Date(s).getTime();

it('erzeugt deutsche CSV mit Merkmal-Spalten', () => {
  const dims: Dimension[] = [
    { id: 'd1', key: 'project', name: 'Projekt', multi: false, enabled: true, sort: 0, ...meta },
    { id: 'd2', key: 'tags', name: 'Tags', multi: true, enabled: true, sort: 1, ...meta },
  ];
  const values: DimensionValue[] = [
    { id: 'p', dimensionId: 'd1', name: 'Kunde A', color: '#000', archived: false, ...meta },
    { id: 't1', dimensionId: 'd2', name: 'Meeting', color: '#000', archived: false, ...meta },
    { id: 't2', dimensionId: 'd2', name: 'Remote', color: '#000', archived: false, ...meta },
  ];
  const entries: Entry[] = [
    { id: '2', startAt: at('2026-03-03T22:00'), endAt: at('2026-03-04T01:00'), note: '', valueIds: [], articleId: null, orderNo: null, quantity: null, ...meta },
    { id: '1', startAt: at('2026-03-02T08:00'), endAt: at('2026-03-02T09:30'), note: 'Sagt "Hallo"; ok', valueIds: ['p', 't1', 't2'], articleId: 'a1', orderNo: 'A-77', quantity: 24, ...meta },
  ];
  const articles: Article[] = [{ id: 'a1', number: '4711', name: 'Halter', description: '', ...meta }];
  expect(entriesToCsv(entries, dims, values, articles, 0).split('\r\n')).toEqual([
    'Datum;Start;Ende;Dauer (h);Artikelnummer;Artikelname;Auftragsnummer;Stückzahl;Projekt;Tags;Notiz',
    '02.03.2026;08:00;09:30;1,50;4711;Halter;A-77;24;Kunde A;Meeting, Remote;"Sagt ""Hallo""; ok"',
    '03.03.2026;22:00;04.03.2026 01:00;3,00;;;;;;;',
  ]);
});
