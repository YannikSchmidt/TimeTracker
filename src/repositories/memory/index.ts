import { DEFAULT_DIMENSIONS } from '../../domain/defaults';
import { DEFAULT_SETTINGS, type Dimension, type DimensionValue, type Entry, type Millis, type Settings } from '../../domain/types';
import { validateEntry } from '../validation';
import type { BackupData, EntryInput, Repositories } from '../types';

export interface MemoryOptions {
  /** Zuvor gespeicherter Stand (gleiches Format wie ein Backup). */
  initial?: BackupData | null;
  /** Wird nach jeder Änderung mit dem kompletten Stand aufgerufen. */
  persist?: (snapshot: BackupData) => void;
  makeId: () => string;
  now?: () => Millis;
}

/**
 * Repositories im Speicher – für die Browser-Vorschau (mit localStorage-Persistenz)
 * und für Tests. Gleiches Verhalten wie die SQLite-Variante.
 */
export function createMemoryRepositories({ initial, persist, makeId, now = Date.now }: MemoryOptions): Repositories {
  let entries: Entry[] = initial?.entries.map((e) => ({ ...e, valueIds: [...e.valueIds] })) ?? [];
  let dimensions: Dimension[] = initial?.dimensions.map((d) => ({ ...d })) ?? [];
  let values: DimensionValue[] = initial?.values.map((v) => ({ ...v })) ?? [];
  let settings: Settings = { ...DEFAULT_SETTINGS, ...initial?.settings };

  if (dimensions.length === 0) {
    const t = now();
    dimensions = DEFAULT_DIMENSIONS.map((d, i) => ({
      id: makeId(), ...d, sort: i, createdAt: t, updatedAt: t, deletedAt: null,
    }));
  }

  const snapshot = (): BackupData => ({
    version: 1,
    exportedAt: now(),
    entries: entries.map((e) => ({ ...e, valueIds: [...e.valueIds] })),
    dimensions: dimensions.map((d) => ({ ...d })),
    values: values.map((v) => ({ ...v })),
    settings: { ...settings, workDays: [...settings.workDays] },
  });
  const changed = () => persist?.(snapshot());
  const copy = (e: Entry): Entry => ({ ...e, valueIds: [...e.valueIds] });
  const live = () => entries.filter((e) => !e.deletedAt).sort((a, b) => b.startAt - a.startAt);

  const insert = (input: EntryInput): Entry => {
    const t = now();
    const entry: Entry = { id: makeId(), ...input, valueIds: [...new Set(input.valueIds)], createdAt: t, updatedAt: t, deletedAt: null };
    entries.push(entry);
    return copy(entry);
  };

  const repos: Repositories = {
    entries: {
      async listInRange(start, end) {
        return live().filter((e) => e.startAt < end && (e.endAt === null || e.endAt > start)).map(copy);
      },
      async listAll() {
        return live().map(copy);
      },
      async get(id) {
        const e = entries.find((x) => x.id === id);
        return e ? copy(e) : null;
      },
      async getRunning() {
        const e = live().find((x) => x.endAt === null);
        return e ? copy(e) : null;
      },
      async start(input = {}) {
        const t = now();
        for (const e of entries) {
          if (e.endAt === null && !e.deletedAt) Object.assign(e, { endAt: t, updatedAt: t });
        }
        const created = insert({ startAt: t, endAt: null, note: input.note ?? '', valueIds: input.valueIds ?? [] });
        changed();
        return created;
      },
      async stop(id, at = now()) {
        const e = entries.find((x) => x.id === id && x.endAt === null);
        if (e) {
          Object.assign(e, { endAt: at, updatedAt: now() });
          changed();
        }
      },
      async create(input) {
        validateEntry(input);
        const created = insert(input);
        changed();
        return created;
      },
      async update(id, input) {
        const e = entries.find((x) => x.id === id);
        if (!e) throw new Error('Eintrag nicht gefunden.');
        const next = { ...e, ...input };
        validateEntry(next);
        Object.assign(e, next, {
          valueIds: input.valueIds ? [...new Set(input.valueIds)] : e.valueIds,
          updatedAt: now(),
        });
        changed();
      },
      async remove(id) {
        const e = entries.find((x) => x.id === id);
        if (e) {
          const t = now();
          Object.assign(e, { deletedAt: t, updatedAt: t });
          changed();
        }
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

    settings: {
      async get() {
        return { ...settings, workDays: [...settings.workDays] };
      },
      async set(input) {
        settings = { ...settings, ...stripUndefined(input) };
        changed();
      },
    },

    async exportBackup() {
      return snapshot();
    },

    async importBackup(data) {
      if (data?.version !== 1 || !Array.isArray(data.entries)) {
        throw new Error('Unbekanntes Backup-Format.');
      }
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
      for (const e of data.entries) entries = upsert(entries, { ...e, valueIds: [...e.valueIds] });
      if (data.settings) settings = { ...settings, ...data.settings };
      changed();
    },
  };
  return repos;
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
