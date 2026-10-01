# TimeTracker

Mobile App (iOS & Android) zur Zeiterfassung per Start/Stopp mit Statistiken.
Gebaut mit [Expo](https://expo.dev) / React Native und TypeScript. Alle Daten liegen lokal auf dem Gerät (SQLite).

## Funktionen

- **Timer**: Start/Stopp mit einem Tipp. Ein laufender Timer überlebt das Schließen der App.
- **Einträge**: Liste nach Tagen mit Tagessumme, Einträge bearbeiten, löschen oder nachträglich erfassen.
- **Merkmale**: Projekt (mit Farbe) und Tags sind aktiv. Person, Auftrag, Typ und Bezeichnung sind vorbereitet
  und lassen sich in den Einstellungen einschalten. Eigene Merkmale können hinzugefügt werden.
- **Statistik** (Woche/Monat/Jahr, vor/zurück blättern):
  - Übersicht: Gesamtzeit, Über-/Fehlstunden gegenüber Soll, Ø pro aktivem Tag, Anzahl Einträge, Säulendiagramm
  - Aufklappbare Details: Verteilung nach Merkmal (Ring + Liste), Verlauf (12 Wochen/Monate),
    weitere Kennzahlen (längste Session, Serie, …), Wochentage, Tageszeiten
- **Einstellungen**: Wochen-Sollstunden, Arbeitstage, CSV-Export (Excel), JSON-Backup exportieren/importieren.

## Auf dem Handy ausprobieren

Voraussetzung: [Node.js](https://nodejs.org) (LTS) auf dem Rechner, die App **Expo Go** auf dem Handy
([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779)).

```bash
npm install
npx expo start
```

Den angezeigten QR-Code mit Expo Go (Android) bzw. der Kamera-App (iPhone) scannen. Handy und Rechner müssen im
selben WLAN sein – sonst `npx expo start --tunnel` verwenden.

### Ohne Rechner: Browser-Vorschau

```bash
npm run build:preview   # → dist-preview/timetracker.html (eine Datei, alles eingebettet)
```

Die Datei läuft in jedem Browser, auch auf dem Handy. Im Browser werden die Daten im `localStorage`
gespeichert statt in SQLite, und Export/Backup sind dort ausgeblendet.

Eine installierbare App (APK / TestFlight) lässt sich später mit [EAS Build](https://docs.expo.dev/build/introduction/) erzeugen.

## Entwicklung

```bash
npm test            # Unit-Tests (Statistik, Zeit-Logik, CSV)
npm run typecheck   # TypeScript
npm run lint        # ESLint
```

### Struktur

```
src/
  app/                 Screens (Expo Router): Timer, Einträge, Statistik, Einstellungen, Eintrag bearbeiten
  components/          UI-Bausteine, Diagramme (react-native-svg), Merkmal-Auswahl, Datum/Uhrzeit
  data/DataProvider    Repositories per Context + useQuery (lädt nach Änderungen automatisch neu)
  db/                  SQLite-Migrationen
  domain/              Reine Logik ohne UI: Zeit, Statistik, CSV-Export (mit Tests)
  repositories/        Interfaces + SQLite-Implementierung
```

### Datenmodell & späterer Server-Sync

- `entries` (Start, Ende – `NULL` = läuft, Notiz), `dimensions` (Merkmale), `dimension_values` (Werte),
  `entry_values` (Zuordnung n:m), `settings`.
- Alle Datensätze haben UUIDs sowie `created_at`, `updated_at` und `deleted_at` (Soft-Delete).
  Damit kann später ein Server mehrere Geräte über „Änderungen seit `updated_at`“ synchronisieren,
  ohne ID-Konflikte.
- Die Screens greifen nur über die Interfaces in `src/repositories/types.ts` auf Daten zu.
  Für einen Server-Sync wird dort eine weitere Implementierung ergänzt, die UI bleibt unverändert.
- Neue Merkmale (z.B. Person, Auftrag) sind nur Datensätze in `dimensions` – keine Schema-Änderung nötig,
  und die Statistik kann automatisch danach gruppieren.
