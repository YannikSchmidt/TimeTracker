/**
 * Standard-Merkmale. Person/Typ/Bezeichnung sind vorbereitet,
 * aber deaktiviert – in den Einstellungen einschaltbar.
 */
export const DEFAULT_DIMENSIONS: { key: string; name: string; multi: boolean; enabled: boolean }[] = [
  { key: 'project', name: 'Projekt', multi: false, enabled: true },
  { key: 'tags', name: 'Tags', multi: true, enabled: true },
  { key: 'person', name: 'Person', multi: false, enabled: false },
  { key: 'type', name: 'Typ', multi: false, enabled: false },
  { key: 'label', name: 'Bezeichnung', multi: false, enabled: false },
];

/** Früher vorbereitetes Merkmal „Auftrag“ – jetzt eigenes Feld am Eintrag. */
export const OBSOLETE_DIMENSION_KEYS = ['order'];
