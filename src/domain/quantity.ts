import type { Entry } from './types';

export interface QuantitySuggestion {
  quantity: number;
  /** 'history' = häufigste Stückzahl dieses Artikels, 'default' = Standard aus den Einstellungen */
  source: 'history' | 'default';
}

/**
 * Stückzahl-Vorschlag für einen Artikel: die am häufigsten erfasste Stückzahl.
 * Bei Gleichstand gewinnt die zuletzt verwendete. Ohne Historie gilt der Standard.
 */
export function suggestQuantity(entries: Entry[], articleId: string | null, defaultQuantity: number): QuantitySuggestion {
  if (!articleId) return { quantity: defaultQuantity, source: 'default' };
  const stats = new Map<number, { count: number; lastUsed: number }>();
  for (const e of entries) {
    if (e.deletedAt || e.articleId !== articleId || e.quantity == null) continue;
    const s = stats.get(e.quantity) ?? { count: 0, lastUsed: 0 };
    s.count++;
    s.lastUsed = Math.max(s.lastUsed, e.startAt);
    stats.set(e.quantity, s);
  }
  let best: { quantity: number; count: number; lastUsed: number } | null = null;
  for (const [quantity, s] of stats) {
    if (!best || s.count > best.count || (s.count === best.count && s.lastUsed > best.lastUsed)) {
      best = { quantity, ...s };
    }
  }
  return best ? { quantity: best.quantity, source: 'history' } : { quantity: defaultQuantity, source: 'default' };
}
