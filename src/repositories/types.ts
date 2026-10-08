import type { BackupData, LegacyBackupData } from '../domain/legacy';
import type { Article, Dimension, DimensionValue, Entry, Job, JobFields, JobKind, Millis, Settings, DeletionKind, DeletionRequest, DeletionStatus, MainGroup, ProductGroup } from '../domain/types';

export type { BackupData, LegacyBackupData };

/**
 * Datenzugriff der App. Die UI kennt nur diese Interfaces – eine spätere
 * Server-/Sync-Implementierung kann die SQLite-Variante ersetzen oder ergänzen.
 */

export interface JobStartInput extends Partial<JobFields> {
  kind?: JobKind;
  parentJobId?: string | null;
  /** erster Arbeitsschritt (aus dem Ablauf) bzw. der eine Schritt bei onlyStep */
  currentStep?: string | null;
  /** nur diesen Schritt tracken */
  onlyStep?: string | null;
  /** Personenzähler (Standard 1) */
  workers?: number;
  /** Teil bei Gesamtgeräten */
  section?: Job['section'];
}

/**
 * Aufträge und Nacharbeiten. Es läuft immer höchstens einer: Starten oder Fortsetzen
 * pausiert automatisch den laufenden.
 */
export interface JobRepository {
  /** Offene (laufende + pausierte) Aufträge, laufender zuerst, dann zuletzt gestartete. */
  listOpen(): Promise<Job[]>;
  listAll(): Promise<Job[]>;
  get(id: string): Promise<Job | null>;
  start(input: JobStartInput): Promise<Job>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  /** Beendet den Auftrag (laufender Abschnitt wird geschlossen). */
  finish(id: string, extra?: { reworkReason?: string | null }): Promise<void>;
  /**
   * Arbeitsschritt abschließen und zum nächsten wechseln: Der laufende Abschnitt endet jetzt,
   * läuft der Auftrag, beginnt sofort ein neuer Abschnitt mit dem nächsten Schritt.
   * Auch für den freien Wechsel per Schritt-Knopf; bei Einzelschritt-Timern wird der Schritt zum neuen Einzelschritt.
   */
  nextStep(id: string, next: string | null): Promise<void>;
  /**
   * Bisherige Zeit übernehmen: Die letzten zusammenhängenden Abschnitte mit dem bisherigen Schritt (seit dem letzten
   * Wechsel bzw. seit dem Start) zählen ab jetzt zu `step`; der laufende Abschnitt läuft weiter.
   */
  relabelStep(id: string, step: string): Promise<void>;
  /**
   * Schritt umbenennen – nur in den eigenen Aufträgen: allen dieses Artikels und Teils, ohne Artikel nur in `jobId`.
   * Betrifft Abschnitte sowie aktuellen bzw. Einzelschritt.
   */
  renameStep(scope: { articleId: string | null; section: Job['section']; jobId: string }, from: string, to: string): Promise<void>;
  /**
   * Personenzähler ändern. Läuft der Auftrag, endet der aktuelle Abschnitt jetzt und ein neuer mit der
   * neuen Anzahl beginnt – so zählt jede Zeitspanne mit der richtigen Personenzahl.
   */
  setWorkers(id: string, workers: number): Promise<void>;
  /** Abgeschlossenen Auftrag wieder öffnen (pausiert). */
  reopen(id: string): Promise<void>;
  update(id: string, fields: Partial<JobFields>): Promise<void>;
  /** Löscht den Auftrag samt Abschnitten und zugehörigen Nacharbeiten. */
  remove(id: string): Promise<void>;
  /** Abgeschlossenen Auftrag nachträglich erfassen. */
  createManual(input: JobStartInput, startAt: Millis, endAt: Millis): Promise<Job>;
}

/** Arbeitsabschnitte (Zeitspannen) der Aufträge. */
export interface EntryRepository {
  /** Abschnitte, die den Zeitraum [start, end) überlappen (inkl. laufender). */
  listInRange(start: Millis, end: Millis): Promise<Entry[]>;
  listAll(): Promise<Entry[]>;
  get(id: string): Promise<Entry | null>;
  /** Start/Ende bzw. Arbeitsschritt korrigieren; beim laufenden Abschnitt wechselt auch der Schritt des Auftrags. */
  update(id: string, input: { startAt?: Millis; endAt?: Millis | null; step?: string | null }): Promise<void>;
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
  /** Benennung */
  name: string;
  /** Endgerät (Notiz) */
  device: string;
  /** Untergruppe bzw. Hauptgruppe; fehlt = keine (aus der Nummer abgeleitet) */
  groupId?: string | null;
  /** Vorgabezeiten (Minuten) je Arbeitsschritt */
  targets?: Article['targets'];
  /** Gesamtgerät nicht in Display-Verheiratung und Gesamtmontage aufteilen */
  noSections?: boolean;
  /** In der Schritt-Auswahl ausgeblendete Schritte (Display mit Präfix „display:“) */
  hiddenSteps?: string[];
}

export interface GroupRepository {
  /** Hauptgruppen + Untergruppen (nicht gelöschte) */
  list(): Promise<ProductGroup[]>;
  create(input: { main: MainGroup; name: string; parentId: string; steps?: string[]; displaySteps?: string[] }): Promise<ProductGroup>;
  update(id: string, input: { name?: string; steps?: string[]; displaySteps?: string[] }): Promise<void>;
}

export interface ArticleRepository {
  list(): Promise<Article[]>;
  get(id: string): Promise<Article | null>;
  /** Sucht exakt nach Artikelnummer (ohne führende/folgende Leerzeichen). */
  findByNumber(number: string): Promise<Article | null>;
  /** Wirft einen Fehler, wenn die Nummer leer ist oder schon existiert. */
  create(input: ArticleInput): Promise<Article>;
  update(id: string, input: Partial<ArticleInput>): Promise<void>;
  /** Löscht den Artikel; Aufträge verlieren die Zuordnung. */
  remove(id: string): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  set(input: Partial<Settings>): Promise<void>;
}

export interface DeletionRequestInput {
  kind: DeletionKind;
  targetId: string;
  owner: string | null;
  label: string;
  reason: string;
  /** Admin löscht etwas, das auf einem anderen Gerät gelöscht werden muss → gleich bestätigt */
  status?: 'open' | 'approved';
}

export interface DeletionRequestRepository {
  /** Alle (nicht gelöschten) Löschvorschläge, neueste zuerst */
  list(): Promise<DeletionRequest[]>;
  create(input: DeletionRequestInput): Promise<DeletionRequest>;
  setStatus(id: string, status: DeletionStatus): Promise<void>;
}

export interface Repositories {
  jobs: JobRepository;
  requests: DeletionRequestRepository;
  groups: GroupRepository;
  entries: EntryRepository;
  dimensions: DimensionRepository;
  articles: ArticleRepository;
  settings: SettingsRepository;
  exportBackup(): Promise<BackupData>;
  /** Fügt Daten aus einem Backup ein bzw. überschreibt Datensätze mit gleicher ID. */
  importBackup(data: BackupData | LegacyBackupData): Promise<void>;
}

/** Vollständige Job-Felder mit Standardwerten. */
export function jobFieldsWithDefaults(input: Partial<JobFields>): JobFields {
  return {
    articleId: input.articleId ?? null,
    orderNo: input.orderNo?.trim() || null,
    quantity: input.quantity ?? null,
    note: input.note ?? '',
    valueIds: [...new Set(input.valueIds ?? [])],
    reworkReason: input.reworkReason?.trim() || null,
  };
}

/** Sortierung offener Aufträge: laufender zuerst, dann zuletzt gestartete. */
export function sortOpenJobs(jobs: Job[]): Job[] {
  return [...jobs].sort(
    (a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.startedAt - a.startedAt,
  );
}
