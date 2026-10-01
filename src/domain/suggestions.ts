import type { Job } from './types';

interface Ranked {
  value: string;
  count: number;
  lastUsed: number;
}

/** Werte ohne Duplikate, sortiert nach Häufigkeit oder zuletzt verwendet. */
function rank(items: { value: string | null; at: number }[], by: 'frequency' | 'recency', limit: number): string[] {
  const map = new Map<string, Ranked>();
  for (const { value, at } of items) {
    const v = value?.trim();
    if (!v) continue;
    const r = map.get(v) ?? { value: v, count: 0, lastUsed: 0 };
    r.count++;
    r.lastUsed = Math.max(r.lastUsed, at);
    map.set(v, r);
  }
  return [...map.values()]
    .sort((a, b) =>
      by === 'frequency' ? b.count - a.count || b.lastUsed - a.lastUsed : b.lastUsed - a.lastUsed || b.count - a.count,
    )
    .slice(0, limit)
    .map((r) => r.value);
}

const live = (jobs: Job[]) => jobs.filter((j) => !j.deletedAt);

/** Zuletzt verwendete Auftragsnummern (neueste zuerst). */
export function recentOrders(jobs: Job[], limit = 6): string[] {
  return rank(
    live(jobs)
      .filter((j) => j.kind === 'order')
      .map((j) => ({ value: j.orderNo, at: j.startedAt })),
    'recency',
    limit,
  );
}

/** Alle bekannten Auftragsnummern, z.B. für die Suche beim Eintippen. */
export function knownOrders(jobs: Job[]): string[] {
  return recentOrders(jobs, Infinity);
}

/** Häufigste Artikel (IDs). */
export function frequentArticles(jobs: Job[], limit = 6): string[] {
  return rank(
    live(jobs).map((j) => ({ value: j.articleId, at: j.startedAt })),
    'frequency',
    limit,
  );
}

/** Bisherige Nacharbeitsgründe, häufigste zuerst. */
export function reworkReasons(jobs: Job[], limit = 8): string[] {
  return rank(
    live(jobs)
      .filter((j) => j.kind === 'rework')
      .map((j) => ({ value: j.reworkReason, at: j.finishedAt ?? j.startedAt })),
    'frequency',
    limit,
  );
}

/** Letzter Auftrag mit dieser Nummer – liefert Artikel und Stückzahl für einen schnellen Start. */
export function lastJobForOrder(jobs: Job[], orderNo: string): Job | null {
  const n = orderNo.trim();
  return (
    live(jobs)
      .filter((j) => j.kind === 'order' && j.orderNo === n)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  );
}
