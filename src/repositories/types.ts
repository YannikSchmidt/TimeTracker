import type { Article, Dimension, DimensionValue, Entry, Millis, Settings } from '../domain/types';

/**
 * Datenzugriff der App. Die UI kennt nur diese Interfaces – eine spätere
 * Server-/Sync-Implementierung kann die SQLite-Variante ersetzen oder ergänzen.
 */
export interface EntryInput {
  startAt: Millis;
  endAt: Millis | null;
  note: string;
  valueIds: string[];
  articleId: string | null;
  orderNo: string | null;
  quantity: number | null;
}

/** Felder, die beim Start eines Timers mitgegeben werden können. */
export type StartInput = Partial<Pick<EntryInput, 'note' | 'valueIds' | 'articleId' | 'orderNo' | 'quantity'>>;

export interface EntryRepository {
  /** Einträge, die den Zeitraum [start, end) überlappen (inkl. laufender). */
  listInRange(start: Millis, end: Millis): Promise<Entry[]>;
  listAll(): Promise<Entry[]>;
  get(id: string): Promise<Entry | null>;
  getRunning(): Promise<Entry | null>;
  /** Startet einen neuen Timer; ein evtl. laufender wird vorher gestoppt. */
  start(input?: StartInput): Promise<Entry>;
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

export interface ArticleInput {
  number: string;
  name: string;
  description: string;
}

export interface ArticleRepository {
  list(): Promise<Article[]>;
  get(id: string): Promise<Article | null>;
  /** Sucht exakt nach Artikelnummer (ohne führende/folgende Leerzeichen). */
  findByNumber(number: string): Promise<Article | null>;
  /** Wirft einen Fehler, wenn die Nummer leer ist oder schon existiert. */
  create(input: ArticleInput): Promise<Article>;
  update(id: string, input: Partial<ArticleInput>): Promise<void>;
  /** Löscht den Artikel; Einträge verlieren die Zuordnung. */
  remove(id: string): Promise<void>;
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
  /** Fehlt in Backups vor Einführung der Artikel. */
  articles?: Article[];
  settings: Settings;
}

export interface Repositories {
  entries: EntryRepository;
  dimensions: DimensionRepository;
  articles: ArticleRepository;
  settings: SettingsRepository;
  exportBackup(): Promise<BackupData>;
  /** Fügt Daten aus einem Backup ein bzw. überschreibt Datensätze mit gleicher ID. */
  importBackup(data: BackupData): Promise<void>;
}
