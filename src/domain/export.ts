import { format } from 'date-fns';

import { entryMs } from './flows';
import { jobTimes } from './jobs';
import { toHours } from './time';
import type { Article, Dimension, DimensionValue, Entry, Job } from './types';

function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const hours = (ms: number) => toHours(ms).toFixed(2).replace('.', ',');

/**
 * CSV für Excel (deutsch): Semikolon als Trenner, Komma als Dezimalzeichen.
 * Eine Zeile pro Auftrag bzw. Nacharbeit; Arbeitszeit = Zeit, in der der Timer lief.
 */
export function jobsToCsv(
  jobs: Job[],
  entries: Entry[],
  dimensions: Dimension[],
  values: DimensionValue[],
  articles: Article[],
  now: number,
  /** Vorgabezeit eines Auftrags (ms) – leer, wenn keine hinterlegt */
  targetOf: (job: Job) => number | null = () => null,
): string {
  const valuesById = new Map(values.map((v) => [v.id, v]));
  const articlesById = new Map(articles.map((a) => [a.id, a]));
  const live = jobs.filter((j) => !j.deletedAt);
  const header = [
    'Art',
    'Datum',
    'Start',
    'Ende',
    'Auftragsnummer',
    'Artikelnummer',
    'Artikelbenennung',
    'Endgerät',
    'Stückzahl',
    'Arbeitszeit (h)',
    'Personenzeit (h)',
    'Vorgabe (h)',
    'Gesamtzeit (h)',
    'Nacharbeit (h)',
    'Nacharbeitsgrund',
    ...dimensions.map((d) => d.name),
    'Notiz',
  ];
  const rows = [...live]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((j) => {
      const t = jobTimes(j, entries, now);
      const article = j.articleId ? articlesById.get(j.articleId) : undefined;
      const rework =
        j.kind === 'order'
          ? live
              .filter((r) => r.kind === 'rework' && r.parentJobId === j.id)
              .reduce((sum, r) => sum + jobTimes(r, entries, now).workMs, 0)
          : 0;
      const end = j.finishedAt;
      const dimCols = dimensions.map((d) =>
        j.valueIds
          .map((id) => valuesById.get(id))
          .filter((v): v is DimensionValue => v?.dimensionId === d.id)
          .map((v) => v.name)
          .join(', '),
      );
      return [
        j.kind === 'rework' ? 'Nacharbeit' : 'Auftrag',
        format(t.firstStart, 'dd.MM.yyyy'),
        format(t.firstStart, 'HH:mm'),
        end === null
          ? ''
          : format(end, 'dd.MM.yyyy') === format(t.firstStart, 'dd.MM.yyyy')
            ? format(end, 'HH:mm')
            : format(end, 'dd.MM.yyyy HH:mm'),
        j.orderNo ?? '',
        article?.number ?? '',
        article?.name ?? '',
        article?.device ?? '',
        j.quantity == null ? '' : String(j.quantity),
        hours(t.workMs),
        hours(entries.filter((e) => e.jobId === j.id && !e.deletedAt).reduce((s, e) => s + entryMs(e, now, true), 0)),
        (() => {
          const target = j.kind === 'order' ? targetOf(j) : null;
          return target === null ? '' : hours(target);
        })(),
        hours(t.totalMs),
        rework > 0 ? hours(rework) : '',
        j.reworkReason ?? '',
        ...dimCols,
        j.note,
      ];
    });
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}
