import { articleForSection, targetSteps } from './targets';
import type { Article, Millis, PlanItem, Section } from './types';

const MIN = 60_000;
const HOUR = 3_600_000;

/** Vorgabe eines Artikels für den Planer: Rüstzeit (einmal) + Zeit pro Stück, über alle Schritte (und Teile). */
export interface PlanTarget {
  setupMs: Millis;
  perPieceMs: Millis;
  /** false = keine Vorgabezeiten hinterlegt (zählt im Planer nicht) */
  hasTarget: boolean;
}

/**
 * Vorgabe über den ganzen Ablauf. Gesamtgeräte mit Aufteilung zählen als Ganzes: Display-Verheiratung +
 * Gesamtmontage. `stepsOf(section)` liefert den Ablauf des Teils (leer = ganzer Auftrag).
 */
export function planTarget(article: Article | null | undefined, stepsOf: (section: Section | null) => string[], split: boolean): PlanTarget {
  let setup = 0;
  let perPiece = 0;
  let hasTarget = false;
  const sections: (Section | null)[] = split ? ['display', 'assembly'] : [null];
  for (const section of sections) {
    const a = articleForSection(article, section);
    for (const step of targetSteps(stepsOf(section))) {
      const t = a?.targets?.[step];
      if (!t || (!t.setup && !t.perPiece)) continue;
      hasTarget = true;
      setup += t.setup;
      perPiece += t.perPiece;
    }
  }
  return { setupMs: Math.round(setup * MIN), perPieceMs: Math.round(perPiece * MIN), hasTarget };
}

/** Vorgabezeit einer Planer-Zeile (0 Stück = keine Zeit) */
export function planItemMs(target: PlanTarget, quantity: number): Millis {
  if (!target.hasTarget || quantity <= 0) return 0;
  return target.setupMs + target.perPieceMs * quantity;
}

export interface PlanSummary {
  totalMs: Millis;
  /** Arbeitsstunden pro Tag laut Wochenarbeitszeit und Arbeitstagen */
  hoursPerDay: number;
  /** Gesamt in Arbeitstagen bzw. Wochen */
  days: number;
  weeks: number;
  weekMs: Millis;
  /** diese Woche schon gearbeitet */
  workedMs: Millis;
  /** Rest der Woche nach gearbeiteter und geplanter Zeit (negativ = zu viel) */
  freeMs: Millis;
  /** je Zeile: wie viele Stück dieses Artikels noch zusätzlich in die Woche passen (null = keine Stückzeit) */
  fitsMore: (number | null)[];
}

export function planSummary(
  items: { target: PlanTarget; quantity: number }[],
  weeklyHours: number,
  workDays: number,
  workedMs: Millis,
): PlanSummary {
  const totalMs = items.reduce((sum, i) => sum + planItemMs(i.target, i.quantity), 0);
  const weekMs = Math.max(0, weeklyHours) * HOUR;
  const hoursPerDay = workDays > 0 ? weeklyHours / workDays : 0;
  const freeMs = weekMs - workedMs - totalMs;
  return {
    totalMs,
    hoursPerDay,
    days: hoursPerDay > 0 ? totalMs / (hoursPerDay * HOUR) : 0,
    weeks: weekMs > 0 ? totalMs / weekMs : 0,
    weekMs,
    workedMs,
    freeMs,
    fitsMore: items.map(({ target, quantity }) => {
      if (!target.hasTarget || target.perPieceMs <= 0) return null;
      // ohne Stück in der Liste kommt die Rüstzeit noch dazu
      const free = freeMs - (quantity > 0 ? 0 : target.setupMs);
      return Math.max(0, Math.floor(free / target.perPieceMs));
    }),
  };
}

/** 1.6 → „1,6“ */
export function formatDecimal(n: number, digits = 1): string {
  const f = 10 ** digits;
  return String(Math.round(n * f) / f).replace('.', ',');
}

/** Gespeicherte Planer-Liste mit eindeutigen Zeilen-IDs (ältere Einträge ohne ID bekommen eine abgeleitete). */
export function normalizePlan(items: (Omit<PlanItem, 'id'> & { id?: string })[] | undefined): PlanItem[] {
  const seen = new Set<string>();
  return (items ?? []).map((item, i) => {
    let id = item.id || `${item.articleId}-${i}`;
    while (seen.has(id)) id += '+';
    seen.add(id);
    return { ...item, id };
  });
}

/** Neue Zeilen-ID */
export function newPlanId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Nummer des Auftrags bei mehrfach eingetragenem Artikel („Auftrag 2“), sonst null */
export function orderNumbers(items: PlanItem[]): (number | null)[] {
  const total = new Map<string, number>();
  for (const i of items) total.set(i.articleId, (total.get(i.articleId) ?? 0) + 1);
  const seen = new Map<string, number>();
  return items.map((i) => {
    if ((total.get(i.articleId) ?? 0) < 2) return null;
    const n = (seen.get(i.articleId) ?? 0) + 1;
    seen.set(i.articleId, n);
    return n;
  });
}
