import { format } from 'date-fns';

import { toHours } from './time';
import type { Article, Dimension, DimensionValue, Entry } from './types';

function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV für Excel (deutsch): Semikolon als Trenner, Komma als Dezimalzeichen.
 * Artikel/Auftrag/Stückzahl und pro Merkmal (Projekt, Tags, …) eine eigene Spalte.
 */
export function entriesToCsv(
  entries: Entry[],
  dimensions: Dimension[],
  values: DimensionValue[],
  articles: Article[],
  now: number,
): string {
  const valuesById = new Map(values.map((v) => [v.id, v]));
  const articlesById = new Map(articles.map((a) => [a.id, a]));
  const header = [
    'Datum',
    'Start',
    'Ende',
    'Dauer (h)',
    'Artikelnummer',
    'Artikelname',
    'Auftragsnummer',
    'Stückzahl',
    ...dimensions.map((d) => d.name),
    'Notiz',
  ];
  const rows = [...entries]
    .filter((e) => !e.deletedAt)
    .sort((a, b) => a.startAt - b.startAt)
    .map((e) => {
      const end = e.endAt ?? now;
      const article = e.articleId ? articlesById.get(e.articleId) : undefined;
      const dimCols = dimensions.map((d) =>
        e.valueIds
          .map((id) => valuesById.get(id))
          .filter((v): v is DimensionValue => v?.dimensionId === d.id)
          .map((v) => v.name)
          .join(', '),
      );
      return [
        format(e.startAt, 'dd.MM.yyyy'),
        format(e.startAt, 'HH:mm'),
        e.endAt === null ? '' : format(end, 'dd.MM.yyyy') === format(e.startAt, 'dd.MM.yyyy') ? format(end, 'HH:mm') : format(end, 'dd.MM.yyyy HH:mm'),
        toHours(end - e.startAt).toFixed(2).replace('.', ','),
        article?.number ?? '',
        article?.name ?? '',
        e.orderNo ?? '',
        e.quantity == null ? '' : String(e.quantity),
        ...dimCols,
        e.note,
      ];
    });
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}
