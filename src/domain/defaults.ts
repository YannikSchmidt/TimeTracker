/**
 * Standard-Merkmale. Person/Auftrag/Typ/Bezeichnung sind vorbereitet,
 * aber deaktiviert – in den Einstellungen einschaltbar.
 */
export const DEFAULT_DIMENSIONS: { key: string; name: string; multi: boolean; enabled: boolean }[] = [
  { key: 'project', name: 'Projekt', multi: false, enabled: true },
  { key: 'tags', name: 'Tags', multi: true, enabled: true },
  { key: 'person', name: 'Person', multi: false, enabled: false },
  { key: 'order', name: 'Auftrag', multi: false, enabled: false },
  { key: 'type', name: 'Typ', multi: false, enabled: false },
  { key: 'label', name: 'Bezeichnung', multi: false, enabled: false },
];
