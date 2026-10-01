import type { Dimension, DimensionValue, Entry, Millis, Settings } from '../domain/types';

/**
 * Datenzugriff der App. Die UI kennt nur diese Interfaces – eine spätere
 * Server-/Sync-Implementierung kann die SQLite-Variante ersetzen oder ergänzen.
 */
export interface EntryInput {
  startAt: Millis;
  endAt: Millis | null;
  note: string;
  valueIds: string[];
}

export interface EntryRepository {
  /** Einträge, die den Zeitraum [start, end) überlappen (inkl. laufender). */
  listInRange(start: Millis, end: Millis): Promise<Entry[]>;
  listAll(): Promise<Entry[]>;
  get(id: string): Promise<Entry | null>;
  getRunning(): Promise<Entry | null>;
  /** Startet einen neuen Timer; ein evtl. laufender wird vorher gestoppt. */
  start(input?: Partial<Pick<EntryInput, 'note' | 'valueIds'>>): Promise<Entry>;
  stop(id: string, at?: Millis): Promise<void>;
  create(input: EntryInput): Promise<Entry>;
  update(id: string, input: Partial<EntryInput>): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface DimensionRepository {
  listDimensions(): Promise<Dimension[]>;
  listValues(): Promise<DimensionValue[]>;
  createDimension(input: { name: string; multi: boolean }): Promise<Dimension>;
  updateDimension(id: string, input: Partial<Pick<Dimension, 'name' | 'enabled' | 'multi'>>): Promise<void>;
  createValue(input: { dimensionId: string; name: string; color: string }): Promise<DimensionValue>;
  updateValue(id: string, input: Partial<Pick<DimensionValue, 'name' | 'color' | 'archived'>>): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  set(input: Partial<Settings>): Promise<void>;
}

export interface BackupData {
  version: 1;
  exportedAt: Millis;
  entries: Entry[];
  dimensions: Dimension[];
  values: DimensionValue[];
  settings: Settings;
}

export interface Repositories {
  entries: EntryRepository;
  dimensions: DimensionRepository;
  settings: SettingsRepository;
  exportBackup(): Promise<BackupData>;
  /** Fügt Daten aus einem Backup ein bzw. überschreibt Datensätze mit gleicher ID. */
  importBackup(data: BackupData): Promise<void>;
}
