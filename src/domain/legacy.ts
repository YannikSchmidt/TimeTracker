import { withMainGroups } from './flows';
import type { Article, DeletionRequest, Dimension, DimensionValue, Entry, Job, Millis, ProductGroup, Settings } from './types';

/** Eintrag im Format bis Version 1 (ein Eintrag = ein Timer mit allen Feldern). */
export interface LegacyEntry {
  id: string;
  startAt: Millis;
  endAt: Millis | null;
  note?: string;
  valueIds?: string[];
  articleId?: string | null;
  orderNo?: string | null;
  quantity?: number | null;
  createdAt: Millis;
  updatedAt: Millis;
  deletedAt: Millis | null;
}

/** Gespeicherter Stand / Backup. Version 2: Aufträge (jobs) + Abschnitte (entries). */
export interface BackupData {
  version: 2;
  exportedAt: Millis;
  jobs: Job[];
  entries: Entry[];
  dimensions: Dimension[];
  values: DimensionValue[];
  articles: Article[];
  settings: Settings;
  /** Zeitpunkt der letzten Änderung der Einstellungen (für den Abgleich zwischen Geräten) */
  settingsUpdatedAt?: Millis;
  /** Löschvorschläge (gemeinsam) */
  deletionRequests?: DeletionRequest[];
  /** Produktgruppen mit Ablauf (gemeinsam) */
  groups?: ProductGroup[];
}

export interface LegacyBackupData {
  version: 1;
  exportedAt: Millis;
  entries: LegacyEntry[];
  dimensions: Dimension[];
  values: DimensionValue[];
  articles?: Article[];
  settings: Settings;
}

/** Wandelt einen alten Eintrag in Auftrag + Abschnitt um (gleiche ID für beide). */
export function legacyEntryToJob(e: LegacyEntry): { job: Job; entry: Entry } {
  const meta = { createdAt: e.createdAt, updatedAt: e.updatedAt, deletedAt: e.deletedAt };
  return {
    job: {
      id: e.id,
      kind: 'order',
      status: e.endAt === null ? 'running' : 'done',
      articleId: e.articleId ?? null,
      orderNo: e.orderNo ?? null,
      quantity: e.quantity ?? null,
      note: e.note ?? '',
      valueIds: [...(e.valueIds ?? [])],
      reworkReason: null,
      parentJobId: null,
      startedAt: e.startAt,
      finishedAt: e.endAt,
      createdBy: null,
      currentStep: null,
      onlyStep: null,
      ...meta,
    },
    entry: { id: e.id, jobId: e.id, startAt: e.startAt, endAt: e.endAt, step: null, ...meta },
  };
}

/**
 * Artikel auf das aktuelle Format bringen: frühere Felder Name + Bezeichnung werden zur Benennung,
 * das Endgerät ist leer, falls noch nicht vorhanden. Unveränderte Artikel werden unverändert zurückgegeben.
 */
export function normalizeArticle(a: Article): Article {
  const legacy = (a.description ?? '').trim();
  if (!legacy && typeof a.device === 'string' && a.description === undefined && a.groupId !== undefined && a.targets) return a;
  const name = a.name.trim();
  const merged = !legacy || legacy === name ? name : name ? `${name} – ${legacy}` : legacy;
  const { description: _old, ...rest } = a;
  return { ...rest, name: merged, device: typeof a.device === 'string' ? a.device : '', groupId: a.groupId ?? null, targets: a.targets ?? {} };
}

/** Aufträge älterer Versionen: fehlende Felder ergänzen. */
export function normalizeJob(j: Job): Job {
  return { ...j, createdBy: j.createdBy ?? null, currentStep: j.currentStep ?? null, onlyStep: j.onlyStep ?? null };
}

/** Bringt ein Backup bzw. einen gespeicherten Stand beliebiger Version auf Version 2. */
export function upgradeBackup(data: BackupData | LegacyBackupData): BackupData {
  if (data?.version === 2) {
    if (!Array.isArray(data.jobs) || !Array.isArray(data.entries)) throw new Error('Unbekanntes Backup-Format.');
    return {
      ...data,
      jobs: data.jobs.map(normalizeJob),
      entries: data.entries.map((e) => ({ ...e, step: e.step ?? null })),
      articles: (data.articles ?? []).map(normalizeArticle),
      groups: withMainGroups(data.groups ?? []),
    };
  }
  if (data?.version !== 1 || !Array.isArray(data.entries)) throw new Error('Unbekanntes Backup-Format.');
  const converted = data.entries.map(legacyEntryToJob);
  return {
    version: 2,
    exportedAt: data.exportedAt,
    jobs: converted.map((c) => c.job),
    entries: converted.map((c) => c.entry),
    dimensions: data.dimensions ?? [],
    values: data.values ?? [],
    articles: (data.articles ?? []).map(normalizeArticle),
    groups: withMainGroups([]),
    settings: data.settings,
  };
}
