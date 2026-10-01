import type { Job } from './types';

export interface QuantitySuggestion {
  quantity: number;
  /** 'history' = häufigste Stückzahl dieses Artikels, 'default' = Standard aus den Einstellungen */
  source: 'history' | 'default';
}

/**
 * Stückzahl-Vorschlag für einen Artikel: die am häufigsten erfasste Stückzahl seiner Aufträge.
 * Bei Gleichstand gewinnt die zuletzt verwendete. Ohne Historie gilt der Standard.
 */
export function suggestQuantity(jobs: Job[], articleId: string | null, defaultQuantity: number): QuantitySuggestion {
  if (!articleId) return { quantity: defaultQuantity, source: 'default' };
  const stats = new Map<number, { count: number; lastUsed: number }>();
  for (const j of jobs) {
    if (j.deletedAt || j.kind !== 'order' || j.articleId !== articleId || j.quantity == null) continue;
    const s = stats.get(j.quantity) ?? { count: 0, lastUsed: 0 };
    s.count++;
    s.lastUsed = Math.max(s.lastUsed, j.startedAt);
    stats.set(j.quantity, s);
  }
  let best: { quantity: number; count: number; lastUsed: number } | null = null;
  for (const [quantity, s] of stats) {
    if (!best || s.count > best.count || (s.count === best.count && s.lastUsed > best.lastUsed)) {
      best = { quantity, ...s };
    }
  }
  return best ? { quantity: best.quantity, source: 'history' } : { quantity: defaultQuantity, source: 'default' };
}
