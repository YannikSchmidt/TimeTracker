import { DEFAULT_DIMENSIONS, OBSOLETE_DIMENSION_KEYS } from '../../domain/defaults';
import { upgradeBackup, type BackupData, type LegacyBackupData } from '../../domain/legacy';
import {
  DEFAULT_SETTINGS,
  type Article,
  type DeletionRequest,
  type Dimension,
  type DimensionValue,
  type Entry,
  type Job,
  type Millis,
  type Settings,
} from '../../domain/types';
import { jobFieldsWithDefaults, sortOpenJobs, type JobStartInput, type Repositories } from '../types';
import { duplicateArticleError, normalizeArticleNumber, notFound, validateQuantity, validateTimes } from '../validation';

export interface MemoryOptions {
  /** Zuvor gespeicherter Stand (gleiches Format wie ein Backup, auch ältere Versionen). */
  initial?: BackupData | LegacyBackupData | null;
  /** Wird nach jeder Änderung mit dem kompletten Stand aufgerufen. */
  persist?: (snapshot: BackupData) => void;
  makeId: () => string;
  now?: () => Millis;
  /** GitHub-Login der angemeldeten Person – wird bei neuen Aufträgen/Artikeln eingetragen. */
  owner?: () => string | null;
}

/** Zugriff auf den kompletten Stand – für den Team-Sync. */
export interface MemoryStore {
  repos: Repositories;
  snapshot(): BackupData;
  /** Stand ersetzen (z.B. nach Zusammenführen mit dem Server); ruft persist auf. */
  replace(data: BackupData): void;
}

/**
 * Repositories im Speicher – für die Browser-Vorschau (mit localStorage-Persistenz)
 * und für Tests. Gleiches Verhalten wie die SQLite-Variante.
 */
export function createMemoryRepositories(options: MemoryOptions): Repositories {
  return createMemoryStore(options).repos;
}

export function createMemoryStore({ initial, persist, makeId, now = Date.now, owner = () => null }: MemoryOptions): MemoryStore {
  const start = initial ? upgradeBackup(initial) : null;
  let jobs: Job[] = (start?.jobs ?? []).map(copyJob);
  let entries: Entry[] = (start?.entries ?? []).map((e) => ({ ...e }));
  let dimensions: Dimension[] = start?.dimensions.map((d) => ({ ...d })) ?? [];
  let values: DimensionValue[] = start?.values.map((v) => ({ ...v })) ?? [];
  let articles: Article[] = start?.articles.map((a) => ({ ...a })) ?? [];
  let settings: Settings = { ...DEFAULT_SETTINGS, ...start?.settings };
  let settingsUpdatedAt: Millis = start?.settingsUpdatedAt ?? 0;
  let requests: DeletionRequest[] = (start?.deletionRequests ?? []).map((r) => ({ ...r }));

  if (dimensions.length === 0) {
    dimensions = DEFAULT_DIMENSIONS.map((d, i) => ({
      // Feste IDs, damit Standard-Merkmale auf allen Geräten gleich sind (Team-Sync)
      id: `dim-${d.key}`, ...d, sort: i, createdAt: 0, updatedAt: 0, deletedAt: null,
    }));
  }
  // Wie SQLite-Migration v2: unbenutztes Merkmal „Auftrag“ entfernen (jetzt eigenes Feld).
  for (const d of dimensions) {
    const used = values.some((v) => v.dimensionId === d.id && !v.deletedAt);
    if (OBSOLETE_DIMENSION_KEYS.includes(d.key) && !d.deletedAt && !used) {
      Object.assign(d, { deletedAt: now(), updatedAt: now() });
    }
  }

  const snapshot = (): BackupData => ({
    version: 2,
    exportedAt: now(),
    jobs: jobs.map(copyJob),
    entries: entries.map((e) => ({ ...e })),
    dimensions: dimensions.map((d) => ({ ...d })),
    values: values.map((v) => ({ ...v })),
    articles: articles.map((a) => ({ ...a })),
    settings: { ...settings, workDays: [...settings.workDays] },
    settingsUpdatedAt,
    deletionRequests: requests.map((r) => ({ ...r })),
  });
  const changed = () => persist?.(snapshot());
  const findArticle = (number: string) => (number ? articles.find((a) => a.number === number && !a.deletedAt) : undefined);
  const liveEntries = () => entries.filter((e) => !e.deletedAt).sort((a, b) => b.startAt - a.startAt);
  const liveJobs = () => jobs.filter((j) => !j.deletedAt);
  const findJob = (id: string) => {
    const j = jobs.find((x) => x.id === id && !x.deletedAt);
    if (!j) throw notFound();
    return j;
  };

  /** Schließt alle offenen Abschnitte (optional nur eines Auftrags) und pausiert deren Aufträge. */
  const closeOpen = (t: Millis, jobId?: string) => {
    for (const e of entries) {
      if (e.endAt !== null || e.deletedAt || (jobId && e.jobId !== jobId)) continue;
      Object.assign(e, { endAt: Math.max(t, e.startAt + 1), updatedAt: t });
      const j = jobs.find((x) => x.id === e.jobId);
      if (j && j.status === 'running') Object.assign(j, { status: 'paused', updatedAt: t });
    }
  };

  const openEntry = (jobId: string, t: Millis) => {
    entries.push({ id: makeId(), jobId, startAt: t, endAt: null, createdAt: t, updatedAt: t, deletedAt: null });
  };

  const newJob = (input: JobStartInput, t: Millis, status: Job['status']): Job => {
    const fields = jobFieldsWithDefaults(input);
    validateQuantity(fields.quantity);
    return {
      id: makeId(),
      kind: input.kind ?? 'order',
      status,
      parentJobId: input.parentJobId ?? null,
      ...fields,
      startedAt: t,
      finishedAt: null,
      createdBy: owner(),
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    };
  };

  const repos: Repositories = {
    requests: {
      async list() {
        return requests
          .filter((r) => !r.deletedAt)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((r) => ({ ...r }));
      },
      async create(input) {
        const t = now();
        const approved = input.status === 'approved';
        const request: DeletionRequest = {
          id: makeId(),
          kind: input.kind,
          targetId: input.targetId,
          owner: input.owner,
          label: input.label,
          reason: input.reason.trim(),
          requestedBy: owner(),
          status: approved ? 'approved' : 'open',
          decidedBy: approved ? owner() : null,
          createdAt: t,
          updatedAt: t,
          deletedAt: null,
        };
        requests.push(request);
        changed();
        return { ...request };
      },
      async setStatus(id, status) {
        const r = requests.find((x) => x.id === id);
        if (!r) throw notFound('Löschvorschlag');
        Object.assign(r, { status, updatedAt: now(), ...(status === 'done' ? {} : { decidedBy: owner() }) });
        changed();
      },
    },
    jobs: {
      async listOpen() {
        return sortOpenJobs(liveJobs().filter((j) => j.status !== 'done')).map(copyJob);
      },
      async listAll() {
        return liveJobs().sort((a, b) => b.startedAt - a.startedAt).map(copyJob);
      },
      async get(id) {
        const j = jobs.find((x) => x.id === id);
        return j ? copyJob(j) : null;
      },
      async start(input) {
        const t = now();
        const job = newJob(input, t, 'running');
        closeOpen(t);
        jobs.push(job);
        openEntry(job.id, t);
        changed();
        return copyJob(job);
      },
      async pause(id) {
        const j = findJob(id);
        if (j.status !== 'running') return;
        closeOpen(now(), id);
        changed();
      },
      async resume(id) {
        const j = findJob(id);
        if (j.status === 'running') return;
        const t = now();
        closeOpen(t);
        openEntry(id, t);
        Object.assign(j, { status: 'running', finishedAt: null, updatedAt: t });
        changed();
      },
      async finish(id, extra = {}) {
        const j = findJob(id);
        const t = now();
        closeOpen(t, id);
        const lastEnd = Math.max(j.startedAt, ...entries.filter((e) => e.jobId === id && !e.deletedAt).map((e) => e.endAt ?? t));
        Object.assign(j, {
          status: 'done',
          finishedAt: j.finishedAt ?? lastEnd,
          reworkReason: extra.reworkReason !== undefined ? extra.reworkReason?.trim() || null : j.reworkReason,
          updatedAt: t,
        });
        changed();
      },
      async reopen(id) {
        const j = findJob(id);
        if (j.status !== 'done') return;
        Object.assign(j, { status: 'paused', finishedAt: null, updatedAt: now() });
        changed();
      },
      async update(id, fields) {
        const j = findJob(id);
        const next = jobFieldsWithDefaults({ ...j, ...stripUndefined(fields) });
        validateQuantity(next.quantity);
        Object.assign(j, next, { updatedAt: now() });
        changed();
      },
      async remove(id) {
        const t = now();
        const ids = new Set([id, ...jobs.filter((j) => j.parentJobId === id).map((j) => j.id)]);
        for (const j of jobs) if (ids.has(j.id)) Object.assign(j, { deletedAt: t, updatedAt: t, status: 'done' });
        for (const e of entries) {
          if (ids.has(e.jobId) && !e.deletedAt) Object.assign(e, { deletedAt: t, updatedAt: t, endAt: e.endAt ?? t });
        }
        changed();
      },
      async createManual(input, startAt, endAt) {
        validateTimes(startAt, endAt);
        const job = newJob(input, startAt, 'done');
        job.finishedAt = endAt;
        jobs.push(job);
        entries.push({ id: makeId(), jobId: job.id, startAt, endAt, createdAt: now(), updatedAt: now(), deletedAt: null });
        changed();
        return copyJob(job);
      },
    },

    entries: {
      async listInRange(start, end) {
        return liveEntries()
          .filter((e) => e.startAt < end && (e.endAt === null || e.endAt > start))
          .map((e) => ({ ...e }));
      },
      async listAll() {
        return liveEntries().map((e) => ({ ...e }));
      },
      async get(id) {
        const e = entries.find((x) => x.id === id);
        return e ? { ...e } : null;
      },
      async update(id, input) {
        const e = entries.find((x) => x.id === id && !x.deletedAt);
        if (!e) throw notFound('Abschnitt');
        const startAt = input.startAt ?? e.startAt;
        const endAt = input.endAt === undefined ? e.endAt : input.endAt;
        validateTimes(startAt, endAt);
        Object.assign(e, { startAt, endAt, updatedAt: now() });
        syncJobBounds(e.jobId);
        changed();
      },
      async remove(id) {
        const e = entries.find((x) => x.id === id && !x.deletedAt);
        if (!e) return;
        const t = now();
        Object.assign(e, { deletedAt: t, updatedAt: t });
        const j = jobs.find((x) => x.id === e.jobId);
        if (j && e.endAt === null && j.status === 'running') Object.assign(j, { status: 'paused', updatedAt: t });
        syncJobBounds(e.jobId);
        changed();
      },
    },

    dimensions: {
      async listDimensions() {
        return dimensions.filter((d) => !d.deletedAt).sort((a, b) => a.sort - b.sort).map((d) => ({ ...d }));
      },
      async listValues() {
        return values
          .filter((v) => !v.deletedAt)
          .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
          .map((v) => ({ ...v }));
      },
      async createDimension({ name, multi }) {
        const t = now();
        const id = makeId();
        const sort = Math.max(-1, ...dimensions.map((d) => d.sort)) + 1;
        const dim: Dimension = { id, key: `custom_${id}`, name, multi, enabled: true, sort, createdAt: t, updatedAt: t, deletedAt: null };
        dimensions.push(dim);
        changed();
        return { ...dim };
      },
      async updateDimension(id, input) {
        const d = dimensions.find((x) => x.id === id);
        if (d) {
          Object.assign(d, stripUndefined(input), { updatedAt: now() });
          changed();
        }
      },
      async createValue({ dimensionId, name, color }) {
        const t = now();
        const value: DimensionValue = { id: makeId(), dimensionId, name, color, archived: false, createdAt: t, updatedAt: t, deletedAt: null };
        values.push(value);
        changed();
        return { ...value };
      },
      async updateValue(id, input) {
        const v = values.find((x) => x.id === id);
        if (v) {
          Object.assign(v, stripUndefined(input), { updatedAt: now() });
          changed();
        }
      },
    },

    articles: {
      async list() {
        return articles
          .filter((a) => !a.deletedAt)
          .sort((a, b) => a.number.localeCompare(b.number, 'de', { numeric: true, sensitivity: 'base' }))
          .map((a) => ({ ...a }));
      },
      async get(id) {
        const a = articles.find((x) => x.id === id);
        return a ? { ...a } : null;
      },
      async findByNumber(number) {
        const a = findArticle(number.trim());
        return a ? { ...a } : null;
      },
      async create(input) {
        const number = normalizeArticleNumber(input.number, input.name);
        if (findArticle(number)) throw duplicateArticleError(number);
        const t = now();
        const article: Article = {
          id: makeId(), number, name: input.name.trim(), device: input.device.trim(),
          createdAt: t, updatedAt: t, deletedAt: null, updatedBy: owner(),
        };
        articles.push(article);
        changed();
        return { ...article };
      },
      async update(id, input) {
        const a = articles.find((x) => x.id === id);
        if (!a) throw new Error('Artikel nicht gefunden.');
        const number = input.number === undefined ? a.number : normalizeArticleNumber(input.number, input.name ?? a.name);
        const other = findArticle(number);
        if (other && other.id !== id) throw duplicateArticleError(number);
        Object.assign(a, {
          number,
          name: (input.name ?? a.name).trim(),
          device: (input.device ?? a.device).trim(),
          updatedAt: now(),
          updatedBy: owner(),
        });
        changed();
      },
      async remove(id) {
        const a = articles.find((x) => x.id === id);
        if (!a) return;
        const t = now();
        Object.assign(a, { deletedAt: t, updatedAt: t });
        for (const j of jobs) {
          if (j.articleId === id) Object.assign(j, { articleId: null, updatedAt: t });
        }
        changed();
      },
    },

    settings: {
      async get() {
        return { ...settings, workDays: [...settings.workDays] };
      },
      async set(input) {
        settings = { ...settings, ...stripUndefined(input) };
        settingsUpdatedAt = now();
        changed();
      },
    },

    async exportBackup() {
      return snapshot();
    },

    async importBackup(raw) {
      const data = upgradeBackup(raw);
      // Standard-Merkmale haben auf jedem Gerät eigene IDs → per key zuordnen.
      const dimIdMap = new Map<string, string>();
      for (const d of data.dimensions) {
        const local = dimensions.find((l) => l.key === d.key && !l.key.startsWith('custom_'));
        if (local && local.id !== d.id) {
          Object.assign(local, { name: d.name, enabled: d.enabled, updatedAt: now() });
          dimIdMap.set(d.id, local.id);
        } else {
          dimensions = upsert(dimensions, { ...d });
        }
      }
      for (const v of data.values) {
        values = upsert(values, { ...v, dimensionId: dimIdMap.get(v.dimensionId) ?? v.dimensionId });
      }
      // Artikelnummern sind eindeutig → gleiche Nummer mit anderer ID auf den lokalen Artikel abbilden.
      const articleIdMap = new Map<string, string>();
      for (const a of data.articles) {
        const local = findArticle(a.number);
        if (local && local.id !== a.id && !a.deletedAt) articleIdMap.set(a.id, local.id);
        else articles = upsert(articles, { ...a });
      }
      // Nur ein Auftrag darf laufen: importierte laufende werden pausiert, wenn lokal schon einer läuft.
      const localRunning = jobs.some((j) => j.status === 'running' && !j.deletedAt);
      for (const j of data.jobs) {
        const job = copyJob(j);
        if (job.articleId) job.articleId = articleIdMap.get(job.articleId) ?? job.articleId;
        if (localRunning && job.status === 'running') job.status = 'paused';
        jobs = upsert(jobs, job);
      }
      for (const e of data.entries) {
        const entry = { ...e };
        if (localRunning && entry.endAt === null) entry.endAt = Math.max(now(), entry.startAt + 1);
        entries = upsert(entries, entry);
      }
      if (data.settings) settings = { ...settings, ...data.settings };
      changed();
    },
  };

  /** Startzeit des Auftrags an den frühesten Abschnitt anpassen (nach Bearbeiten). */
  function syncJobBounds(jobId: string) {
    const j = jobs.find((x) => x.id === jobId);
    const own = entries.filter((e) => e.jobId === jobId && !e.deletedAt);
    if (!j || own.length === 0) return;
    j.startedAt = Math.min(...own.map((e) => e.startAt));
    if (j.status === 'done') j.finishedAt = Math.max(...own.map((e) => e.endAt ?? now()));
  }

  return {
    repos,
    snapshot,
    replace(data) {
      const next = upgradeBackup(data);
      jobs = next.jobs.map(copyJob);
      entries = next.entries.map((e) => ({ ...e }));
      dimensions = next.dimensions.map((d) => ({ ...d }));
      values = next.values.map((v) => ({ ...v }));
      articles = next.articles.map((a) => ({ ...a }));
      settings = { ...DEFAULT_SETTINGS, ...next.settings };
      settingsUpdatedAt = next.settingsUpdatedAt ?? settingsUpdatedAt;
      requests = (next.deletionRequests ?? []).map((r) => ({ ...r }));
      changed();
    },
  };
}

function copyJob(j: Job): Job {
  return { ...j, valueIds: [...(j.valueIds ?? [])], createdBy: j.createdBy ?? null };
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
