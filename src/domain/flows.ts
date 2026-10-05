import { classifyCode, type CodePatterns } from './codes';
import type { Article, Entry, MainGroup, ProductGroup } from './types';

/** Feste IDs der Hauptgruppen (gleich auf allen Geräten) */
export const MAIN_GROUP_ID: Record<MainGroup, string> = { device: 'grp-device', part: 'grp-part' };
export const MAIN_GROUP_LABEL: Record<MainGroup, string> = { device: 'Gesamtgeräte', part: 'Fronten / Einzelteile' };

export function defaultMainGroups(): ProductGroup[] {
  return (['device', 'part'] as const).map((main) => ({
    id: MAIN_GROUP_ID[main],
    main,
    name: MAIN_GROUP_LABEL[main],
    parentId: null,
    steps: [],
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  }));
}

/** Fehlende Hauptgruppen ergänzen (z.B. Daten älterer App-Versionen). */
export function withMainGroups(groups: ProductGroup[]): ProductGroup[] {
  const missing = defaultMainGroups().filter((m) => !groups.some((g) => g.id === m.id));
  return missing.length ? [...groups, ...missing] : groups;
}

/** Hauptgruppe eines Artikels: aus der zugeordneten Gruppe, sonst aus dem Aufbau der Artikelnummer. */
export function mainGroupOf(article: Article, groupsById: Map<string, ProductGroup>, patterns: CodePatterns): MainGroup | null {
  const g = article.groupId ? groupsById.get(article.groupId) : undefined;
  if (g && !g.deletedAt) return g.main;
  const kind = article.number ? classifyCode(article.number, patterns) : 'unknown';
  return kind === 'device' || kind === 'part' ? kind : null;
}

export interface Flow {
  main: MainGroup | null;
  /** Untergruppe (falls zugeordnet) */
  subgroup: ProductGroup | null;
  /** Arbeitsschritte in Reihenfolge (leer = kein Ablauf) */
  steps: string[];
}

/** Ablauf eines Artikels: der Untergruppe, sonst der Hauptgruppe. */
export function flowOf(article: Article | null | undefined, groupsById: Map<string, ProductGroup>, patterns: CodePatterns): Flow {
  if (!article) return { main: null, subgroup: null, steps: [] };
  const main = mainGroupOf(article, groupsById, patterns);
  const g = article.groupId ? groupsById.get(article.groupId) : undefined;
  const subgroup = g && g.parentId && !g.deletedAt ? g : null;
  const mainGroup = main ? groupsById.get(MAIN_GROUP_ID[main]) : undefined;
  const steps = subgroup?.steps.length ? subgroup.steps : (mainGroup?.steps ?? []);
  return { main, subgroup, steps: steps.filter((s) => s.trim()) };
}

/** Nächster Schritt nach `current` im Ablauf (null = es war der letzte bzw. nicht im Ablauf). */
export function nextStep(steps: string[], current: string | null): string | null {
  if (!current) return null;
  const i = steps.indexOf(current);
  return i >= 0 && i + 1 < steps.length ? steps[i + 1] : null;
}

/** Arbeitszeit pro Schritt (in Reihenfolge des Ablaufs, danach weitere/ohne Schritt). */
export function timeByStep(entries: Entry[], steps: string[], now: number): { step: string | null; ms: number }[] {
  const sums = new Map<string | null, number>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    sums.set(e.step ?? null, (sums.get(e.step ?? null) ?? 0) + ((e.endAt ?? now) - e.startAt));
  }
  const ordered: { step: string | null; ms: number }[] = steps.filter((s) => sums.has(s)).map((s) => ({ step: s, ms: sums.get(s)! }));
  for (const [step, ms] of sums) if (step !== null && !steps.includes(step)) ordered.push({ step, ms });
  if (sums.has(null)) ordered.push({ step: null, ms: sums.get(null)! });
  return ordered;
}

/** Schritte bereinigen: getrimmt, ohne leere und doppelte */
export function cleanSteps(steps: string[]): string[] {
  const seen = new Set<string>();
  return steps
    .map((s) => s.trim())
    .filter((s) => {
      const key = s.toLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
