/** Zeitstempel sind immer Millisekunden seit Epoch (UTC). */
export type Millis = number;

export interface SyncMeta {
  createdAt: Millis;
  updatedAt: Millis;
  deletedAt: Millis | null;
}

export interface Entry extends SyncMeta {
  id: string;
  startAt: Millis;
  /** null = Timer läuft noch */
  endAt: Millis | null;
  note: string;
  /** IDs der zugeordneten Merkmal-Werte (Projekt, Tags, Person, …) */
  valueIds: string[];
}

/**
 * Ein Merkmal, nach dem Einträge klassifiziert werden können
 * (z.B. Projekt, Tags, Person, Auftrag, Typ, Bezeichnung).
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
}

export const DEFAULT_SETTINGS: Settings = {
  weeklyTargetHours: 40,
  workDays: [1, 2, 3, 4, 5],
};

/** Halboffenes Intervall [start, end) */
export interface Range {
  start: Millis;
  end: Millis;
}
