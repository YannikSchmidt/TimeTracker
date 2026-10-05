import { DEFAULT_CODE_PATTERNS, type CodePatterns } from './codes';

/** Zeitstempel sind immer Millisekunden seit Epoch (UTC). */
export type Millis = number;

export interface SyncMeta {
  createdAt: Millis;
  updatedAt: Millis;
  deletedAt: Millis | null;
}

export type JobKind = 'order' | 'rework';
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
}

/** Ein Arbeitsabschnitt eines Auftrags (zwischen Start/Fortsetzen und Pause/Beenden). */
export interface Entry extends SyncMeta {
  id: string;
  jobId: string;
  startAt: Millis;
  /** null = läuft gerade */
  endAt: Millis | null;
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
