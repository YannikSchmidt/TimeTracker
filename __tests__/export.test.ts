import { jobsToCsv } from '../src/domain/export';
import type { Article, Dimension, DimensionValue, Entry, Job } from '../src/domain/types';

const meta = { createdAt: 0, updatedAt: 0, deletedAt: null };
const at = (s: string) => new Date(s).getTime();

function job(extra: Partial<Job>): Job {
  return {
    id: 'x', kind: 'order', status: 'done', articleId: null, orderNo: null, quantity: null, note: '', valueIds: [],
    reworkReason: null, parentJobId: null, startedAt: 0, finishedAt: null, createdBy: null, currentStep: null, onlyStep: null, ...meta, ...extra,
  };
}

it('erzeugt deutsche CSV pro Auftrag mit Arbeits-, Gesamt- und Nacharbeitszeit', () => {
  const dims: Dimension[] = [{ id: 'd1', key: 'project', name: 'Projekt', multi: false, enabled: true, sort: 0, ...meta }];
  const values: DimensionValue[] = [{ id: 'p', dimensionId: 'd1', name: 'Kunde A', color: '#000', archived: false, ...meta }];
  const articles: Article[] = [{ id: 'a1', number: '4711', name: 'Halter', device: 'Pumpe P3', groupId: null, targets: {}, ...meta }];
  const jobs: Job[] = [
    job({ id: 'A', orderNo: 'A-77', articleId: 'a1', quantity: 24, valueIds: ['p'], note: 'Sagt "Hallo"; ok',
      startedAt: at('2026-03-02T08:00'), finishedAt: at('2026-03-02T11:00') }),
    job({ id: 'R', kind: 'rework', parentJobId: 'A', orderNo: 'A-77', articleId: 'a1', reworkReason: 'Grat',
      startedAt: at('2026-03-02T13:00'), finishedAt: at('2026-03-02T13:30') }),
  ];
  const entries: Entry[] = [
    { id: 's1', jobId: 'A', startAt: at('2026-03-02T08:00'), endAt: at('2026-03-02T09:00'), step: null, ...meta },
    { id: 's2', jobId: 'A', startAt: at('2026-03-02T10:00'), endAt: at('2026-03-02T11:00'), step: null, ...meta },
    { id: 's3', jobId: 'R', startAt: at('2026-03-02T13:00'), endAt: at('2026-03-02T13:30'), step: null, ...meta },
  ];
  expect(jobsToCsv(jobs, entries, dims, values, articles, 0).split('\r\n')).toEqual([
    'Art;Datum;Start;Ende;Auftragsnummer;Artikelnummer;Artikelbenennung;Endgerät;Teil;Stückzahl;Arbeitszeit (h);Personenzeit (h);Vorgabe (h);Gesamtzeit (h);Nacharbeit (h);Nacharbeitsgrund;Projekt;Notiz',
    'Auftrag;02.03.2026;08:00;11:00;A-77;4711;Halter;Pumpe P3;;24;2,00;2,00;;3,00;0,50;;Kunde A;"Sagt ""Hallo""; ok"',
    'Nacharbeit;02.03.2026;13:00;13:30;A-77;4711;Halter;Pumpe P3;;;0,50;0,50;;0,50;;Grat;;',
  ]);
});
