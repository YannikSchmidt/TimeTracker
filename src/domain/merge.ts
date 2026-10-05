import { normalizeArticle, type BackupData } from './legacy';
import type { Article, DeletionRequest, Dimension, DimensionValue, Entry, Job, Millis, Settings } from './types';

interface Versioned {
  id: string;
  updatedAt: Millis;
  deletedAt: Millis | null;
}

/**
 * Zwei Stände zusammenführen: pro Datensatz gewinnt die neuere Änderung (updatedAt).
 * Gelöschte Datensätze gewinnen immer, damit Löschungen nicht wieder auftauchen.
 */
export function mergeById<T extends Versioned>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of a) map.set(item.id, item);
  for (const item of b) {
    const cur = map.get(item.id);
    if (!cur) {
      map.set(item.id, item);
      continue;
    }
    if (cur.deletedAt && !item.deletedAt) continue;
    if (item.deletedAt && !cur.deletedAt) {
      map.set(item.id, item);
      continue;
    }
    if (item.updatedAt > cur.updatedAt) map.set(item.id, item);
  }
  return [...map.values()];
}

/**
 * Nach dem Zusammenführen darf pro Person nur ein Auftrag laufen (z.B. wenn auf zwei Geräten
 * gleichzeitig gestartet wurde): der zuletzt gestartete läuft weiter, die anderen werden pausiert.
 */
export function fixSingleRunning(jobs: Job[], entries: Entry[], now: Millis): { jobs: Job[]; entries: Entry[] } {
  const open = entries.filter((e) => e.endAt === null && !e.deletedAt);
  const latestOpen = open.reduce<Entry | null>((best, e) => (!best || e.startAt > best.startAt ? e : best), null);
  const runningJobIds = new Set(latestOpen ? [latestOpen.jobId] : []);
  let changed = false;

  const nextEntries = entries.map((e) => {
    if (e.endAt !== null || e.deletedAt || e === latestOpen) return e;
    changed = true;
    // Bis zum Start des neueren Abschnitts – mindestens 1 ms lang
    const end = Math.max(e.startAt + 1, Math.min(latestOpen?.startAt ?? now, now));
    return { ...e, endAt: end, updatedAt: now };
  });
  const nextJobs = jobs.map((j) => {
    const shouldRun = runningJobIds.has(j.id) && j.status !== 'done';
    if (j.status === 'running' && !shouldRun) {
      changed = true;
      return { ...j, status: 'paused' as const, updatedAt: now };
    }
    if (shouldRun && j.status === 'paused') {
      changed = true;
      return { ...j, status: 'running' as const, updatedAt: now };
    }
    return j;
  });
  return changed ? { jobs: nextJobs, entries: nextEntries } : { jobs, entries };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Drei-Wege-Abgleich pro Feld: Basis ist der letzte gemeinsame Stand.
 * Hat nur eine Seite ein Feld geändert, wird diese Änderung übernommen – so gehen parallele
 * Änderungen an verschiedenen Feldern nicht verloren. Ändern beide dasselbe Feld, gewinnt die neuere.
 * Ohne Basis: wie mergeById (neuere Änderung gewinnt).
 */
export function merge3<T extends Versioned>(base: T[] | null, local: T[], remote: T[]): T[] {
  if (!base) return mergeById(local, remote);
  const baseById = new Map(base.map((x) => [x.id, x]));
  const remoteById = new Map(remote.map((x) => [x.id, x]));
  const out = new Map<string, T>();
  for (const l of local) {
    const r = remoteById.get(l.id);
    if (!r) {
      out.set(l.id, l);
      continue;
    }
    if (l.deletedAt || r.deletedAt) {
      out.set(l.id, l.deletedAt ? l : r);
      continue;
    }
    const b = baseById.get(l.id);
    const newer = r.updatedAt > l.updatedAt ? r : l;
    const merged: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const lv = (l as Record<string, unknown>)[k];
      const rv = (r as Record<string, unknown>)[k];
      const bv = b ? (b as Record<string, unknown>)[k] : undefined;
      if (same(lv, rv)) merged[k] = lv;
      else if (b && same(lv, bv)) merged[k] = rv;
      else if (b && same(rv, bv)) merged[k] = lv;
      else merged[k] = (newer as Record<string, unknown>)[k];
    }
    merged.updatedAt = Math.max(l.updatedAt, r.updatedAt);
    out.set(l.id, merged as T);
  }
  for (const r of remote) if (!out.has(r.id)) out.set(r.id, r);
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// Aufteilung für den Team-Sync
// ---------------------------------------------------------------------------

/** Inhalt der Datei einer Person: nur sie schreibt sie. */
export interface PersonData {
  version: 1;
  owner: string;
  /** Anzeigename der Person (z.B. „Max Müller“) */
  name?: string;
  jobs: Job[];
  entries: Entry[];
  settings: Settings;
  settingsUpdatedAt: Millis;
}

/** Gemeinsame Datei: Artikel und Merkmale aller Personen. */
export interface SharedData {
  version: 1;
  articles: Article[];
  dimensions: Dimension[];
  values: DimensionValue[];
  /** Löschvorschläge – fehlt in Dateien älterer App-Versionen */
  deletionRequests?: DeletionRequest[];
}

/** Lokalen Stand in eigene Datei und gemeinsame Datei aufteilen. */
export function splitSnapshot(data: BackupData, owner: string, name?: string): { person: PersonData; shared: SharedData } {
  return {
    person: {
      version: 1,
      owner,
      ...(name ? { name } : {}),
      // Aufträge ohne Besitzer (vor dem Verbinden erfasst) gehören der angemeldeten Person
      jobs: data.jobs.map((j) => (j.createdBy ? j : { ...j, createdBy: owner })),
      entries: data.entries,
      settings: data.settings,
      settingsUpdatedAt: data.settingsUpdatedAt ?? 0,
    },
    shared: normalizeShared({
      version: 1,
      articles: data.articles,
      dimensions: data.dimensions,
      values: data.values,
      deletionRequests: data.deletionRequests ?? [],
    }),
  };
}

/** Eigene und gemeinsame Datei wieder zu einem lokalen Stand zusammensetzen. */
export function joinSnapshot(person: PersonData, shared: SharedData): BackupData {
  return {
    version: 2,
    exportedAt: Date.now(),
    jobs: person.jobs,
    entries: person.entries,
    articles: shared.articles,
    dimensions: shared.dimensions,
    deletionRequests: shared.deletionRequests ?? [],
    values: shared.values,
    settings: person.settings,
    settingsUpdatedAt: person.settingsUpdatedAt,
  };
}

export function mergePerson(local: PersonData, remote: PersonData | null, now: Millis, base: PersonData | null = null): PersonData {
  if (!remote) return local;
  const merged = fixSingleRunning(
    merge3(base?.jobs ?? null, local.jobs, remote.jobs),
    merge3(base?.entries ?? null, local.entries, remote.entries),
    now,
  );
  const remoteNewer = remote.settingsUpdatedAt > local.settingsUpdatedAt;
  return {
    version: 1,
    owner: local.owner,
    ...((local.name ?? remote.name) ? { name: local.name ?? remote.name } : {}),
    jobs: merged.jobs,
    entries: merged.entries,
    settings: remoteNewer ? remote.settings : local.settings,
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt),
  };
}

export function mergeShared(local: SharedData, remote: SharedData | null, base: SharedData | null = null): SharedData {
  if (!remote) return normalizeShared(local);
  return normalizeShared({
    version: 1,
    articles: merge3(base?.articles ?? null, local.articles, remote.articles),
    dimensions: merge3(base?.dimensions ?? null, local.dimensions, remote.dimensions),
    values: merge3(base?.values ?? null, local.values, remote.values),
    deletionRequests: merge3(base?.deletionRequests ?? null, local.deletionRequests ?? [], remote.deletionRequests ?? []),
  });
}

/**
 * Standard-Merkmale (Projekt, Tags, …) können auf verschiedenen Geräten mit unterschiedlichen IDs
 * entstanden sein. Pro key bleibt genau eines (feste ID `dim-<key>` bzw. das älteste); Werte werden umgehängt.
 */
export function normalizeShared(input: SharedData): SharedData {
  const shared = input.articles.some((a) => normalizeArticle(a) !== a)
    ? { ...input, articles: input.articles.map(normalizeArticle) }
    : input;
  const keep = new Map<string, Dimension>();
  for (const d of shared.dimensions) {
    if (d.key.startsWith('custom_') || d.deletedAt) continue;
    const cur = keep.get(d.key);
    const better =
      !cur ||
      (d.id === `dim-${d.key}` && cur.id !== `dim-${d.key}`) ||
      (cur.id !== `dim-${d.key}` && (d.createdAt < cur.createdAt || (d.createdAt === cur.createdAt && d.id < cur.id)));
    if (better) keep.set(d.key, d);
  }
  const remap = new Map<string, string>();
  const dimensions = shared.dimensions.filter((d) => {
    const kept = keep.get(d.key);
    if (!kept || d.key.startsWith('custom_') || d.deletedAt || kept.id === d.id) return true;
    remap.set(d.id, kept.id);
    return false;
  });
  if (remap.size === 0) return shared;
  return {
    ...shared,
    dimensions,
    values: shared.values.map((v) => (remap.has(v.dimensionId) ? { ...v, dimensionId: remap.get(v.dimensionId)! } : v)),
  };
}
