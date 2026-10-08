import { DEFAULT_CODE_PATTERNS, type CodePatterns } from './codes';

/** Zeitstempel sind immer Millisekunden seit Epoch (UTC). */
export type Millis = number;

export interface SyncMeta {
  createdAt: Millis;
  updatedAt: Millis;
  deletedAt: Millis | null;
}

export type JobKind = 'order' | 'rework';
/** Teil eines Gesamtgeräte-Auftrags: Display-Verheiratung oder Gesamtmontage – jeweils ein eigenständiger Auftrag */
export type Section = 'display' | 'assembly';
export type JobStatus = 'running' | 'paused' | 'done';

/** Felder eines Auftrags, die beim Start/Bearbeiten gesetzt werden. */
export interface JobFields {
  articleId: string | null;
  orderNo: string | null;
  /** Stückzahl; null = nicht angegeben */
  quantity: number | null;
  note: string;
  /** IDs der zugeordneten Merkmal-Werte (Projekt, Tags, Person, …) */
  valueIds: string[];
  /** Grund der Nacharbeit (nur bei kind = 'rework') */
  reworkReason: string | null;
}

/**
 * Ein Auftrag bzw. eine Nacharbeit: ein Timer, der pausiert und fortgesetzt werden kann.
 * Die gelaufene Zeit steckt in den Abschnitten (Entry).
 */
export interface Job extends JobFields, SyncMeta {
  id: string;
  kind: JobKind;
  status: JobStatus;
  /** Bei Nacharbeit: der Auftrag, zu dem sie gehört */
  parentJobId: string | null;
  startedAt: Millis;
  /** Zeitpunkt des Abschlusses; null = offen */
  finishedAt: Millis | null;
  /** GitHub-Login der Person, der der Auftrag gehört (null = lokal, ohne Team-Sync) */
  createdBy: string | null;
  /** Arbeitsschritt, der gerade dran ist (aus dem Ablauf des Artikels); null = kein Ablauf bzw. alle erledigt */
  currentStep: string | null;
  /** Nur dieser eine Arbeitsschritt wird getrackt (z.B. beim Aushelfen); null = ganzer Ablauf */
  onlyStep: string | null;
  /** Personenzähler: so viele Personen arbeiten gerade mit diesem Timer (fehlt = 1) */
  workers?: number;
  /** Teil bei Gesamtgeräten (Display-Verheiratung / Gesamtmontage); fehlt/null = nicht aufgeteilt (zählt wie Gesamtmontage) */
  section?: Section | null;
}

/** Ein Arbeitsabschnitt eines Auftrags (zwischen Start/Fortsetzen und Pause/Beenden). */
export interface Entry extends SyncMeta {
  id: string;
  jobId: string;
  startAt: Millis;
  /** null = läuft gerade */
  endAt: Millis | null;
  /** Arbeitsschritt, in dem dieser Abschnitt gearbeitet wurde (null = ohne Schritt) */
  step: string | null;
  /** Anzahl Personen in diesem Abschnitt (Personenzähler, fehlt = 1) */
  workers?: number;
}

/** Abschnitt mit den Feldern seines Auftrags – flache Sicht für Statistik und Export. */
export interface Segment extends Entry, Omit<JobFields, 'reworkReason'> {
  kind: JobKind;
  jobStartedAt: Millis;
}

/** Artikel aus der Artikelverwaltung. */
export interface Article extends SyncMeta {
  id: string;
  /** Artikelnummer (wie auf dem Barcode) */
  number: string;
  /** Benennung */
  name: string;
  /** Endgerät – freie Notiz, wofür/wo der Artikel verwendet wird */
  device: string;
  /** Veraltet: frühere „Bezeichnung“, wird beim Laden in die Benennung übernommen */
  description?: string;
  /** Produktgruppe: Untergruppe oder Hauptgruppe (grp-device / grp-part); null = aus der Nummer ableiten */
  groupId: string | null;
  /** Vorgabezeiten in Minuten je Arbeitsschritt (Schlüssel = Schrittname, '' = ganzer Auftrag ohne Ablauf) */
  targets: Record<string, { setup: number; perPiece: number }>;
  /** Gesamtgerät ohne Aufteilung in Display-Verheiratung und Gesamtmontage (keine Abfrage beim Start) */
  noSections?: boolean;
  /** In der Schritt-Auswahl ausgeblendete, früher verwendete Schritte (Display-Schritte mit Präfix „display:“) */
  hiddenSteps?: string[];
  /** Wer den Artikel zuletzt geändert hat (Team-Sync) */
  updatedBy?: string | null;
}

/**
 * Ein Merkmal, nach dem Aufträge klassifiziert werden können
 * (z.B. Projekt, Tags, Person, Typ, Bezeichnung).
 */
export interface Dimension extends SyncMeta {
  id: string;
  key: string;
  name: string;
  /** true = mehrere Werte pro Eintrag erlaubt (z.B. Tags) */
  multi: boolean;
  enabled: boolean;
  sort: number;
}

export interface DimensionValue extends SyncMeta {
  id: string;
  dimensionId: string;
  name: string;
  color: string;
  archived: boolean;
}

export interface Settings {
  weeklyTargetHours: number;
  /** ISO-Wochentage: 1 = Montag … 7 = Sonntag */
  workDays: number[];
  /** Vorschlag für die Stückzahl, solange ein Artikel noch keine Historie hat */
  defaultQuantity: number;
  /** Muster zum Erkennen gescannter Nummern (Auftrag / Gesamtgerät / Front) */
  codePatterns: CodePatterns;
}

export const DEFAULT_SETTINGS: Settings = {
  weeklyTargetHours: 40,
  workDays: [1, 2, 3, 4, 5],
  defaultQuantity: 24,
  codePatterns: DEFAULT_CODE_PATTERNS,
};

/** Halboffenes Intervall [start, end) */
export interface Range {
  start: Millis;
  end: Millis;
}

export type DeletionKind = 'article' | 'job' | 'entry';
export type DeletionStatus = 'open' | 'approved' | 'rejected' | 'done';

/**
 * Löschvorschlag: Nur Admins löschen; alle anderen schlagen vor. Bestätigte Löschungen von Aufträgen/Abschnitten
 * führt das Gerät der Besitzerin/des Besitzers aus (nur sie schreibt in ihre Datei).
 */
export interface DeletionRequest extends SyncMeta {
  id: string;
  kind: DeletionKind;
  targetId: string;
  /** Besitzer des Auftrags/Abschnitts (Kennung), bei Artikeln null */
  owner: string | null;
  /** Anzeigetext, z.B. „2612345 · Halter links“ */
  label: string;
  reason: string;
  requestedBy: string | null;
  status: DeletionStatus;
  decidedBy: string | null;
}

/** Hauptgruppen – strikt getrennt */
export type MainGroup = 'device' | 'part';

/**
 * Produktgruppe mit Ablauf (Arbeitsschritte in Reihenfolge). Die zwei Hauptgruppen haben feste IDs
 * (grp-device, grp-part) und den Standard-Ablauf; Untergruppen (parentId gesetzt) können einen eigenen haben.
 */
export interface ProductGroup extends SyncMeta {
  id: string;
  main: MainGroup;
  name: string;
  /** null = Hauptgruppe */
  parentId: string | null;
  /** Arbeitsschritte in Reihenfolge; leer bei einer Untergruppe = Ablauf der Hauptgruppe. Bei Gesamtgeräten: Gesamtmontage */
  steps: string[];
  /** Nur Gesamtgeräte: Ablauf der Display-Verheiratung; leer bei einer Untergruppe = Ablauf der Hauptgruppe */
  displaySteps?: string[];
}
