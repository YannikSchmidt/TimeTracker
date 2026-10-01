# TimeTracker

Mobile App (iOS & Android) zur Zeiterfassung per Start/Stopp mit Statistiken.
Gebaut mit [Expo](https://expo.dev) / React Native und TypeScript. Alle Daten liegen lokal auf dem Gerät (SQLite).

## Funktionen

- **Aufträge als Timer-Liste**: Mehrere Aufträge können offen sein, aber immer läuft nur einer.
  Starten oder Fortsetzen eines Auftrags pausiert automatisch den laufenden. Jeder Auftrag ist pausierbar.
- **Start mit Scan zuerst**: „Neuer Auftrag“ → Auftrags-Code scannen → Artikel-Code scannen → Start.
  Ist der Auftrag schon bekannt, werden Artikel und Stückzahl übernommen und der Artikel-Schritt entfällt.
  Eintippen und „ohne Auftrag/Artikel“ sind jederzeit möglich.
- **Vorschläge aus früheren Eingaben**: zuletzt verwendete Auftragsnummern, häufige Artikel, Stückzahl
  (häufigste des Artikels, sonst Standard 24 – einstellbar) und bisherige Nacharbeitsgründe.
- **Nacharbeit**: eigener Timer zu einem Auftrag (offen oder abgeschlossen). Beim Beenden wird der Grund
  eingetragen – bisherige Gründe stehen als Vorschlag bereit.
- **Abschluss**: zeigt die **Arbeitszeit** (Timer lief) groß, dazu Gesamtzeit (erster Start bis Abschluss),
  Pausen und die Nacharbeit.
- **Verlauf**: Aufträge nach Tag mit Arbeitszeit, Gesamtzeit und Nacharbeit; Arbeitsabschnitte einzeln korrigierbar,
  Aufträge nachtragbar.
- **Artikel**: eigener Tab mit Suche, Scan, Nummer, Name und Bezeichnung.
- **Statistik** (Woche/Monat/Jahr): Arbeitszeit inkl. Anteil Nacharbeit, Soll/Ist, Aufträge, Verteilung nach
  Artikel/Auftrag/Merkmal, Artikel & Stückzahlen (Zeit, Nacharbeit, Stück, Min/Stück), Nacharbeit nach Grund, Verlauf.
- **Einstellungen**: Sollstunden, Arbeitstage, Standard-Stückzahl, Merkmale, CSV-Export pro Auftrag, JSON-Backup.

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
gespeichert statt in SQLite, und Export/Backup sind dort ausgeblendet. Scannen funktioniert dort per Foto
(die Kamera-App öffnet sich, das Foto wird ausgewertet) statt mit Live-Kamerabild.

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

- `jobs` (Auftrag bzw. Nacharbeit: Status, Artikel, Auftragsnummer, Stückzahl, Grund, Start/Abschluss),
  `entries` (Arbeitsabschnitte eines Auftrags: Start, Ende – `NULL` = läuft), `articles`, `dimensions` (Merkmale),
  `dimension_values`, `job_values` (Zuordnung n:m), `settings`.
- Alle Datensätze haben UUIDs sowie `created_at`, `updated_at` und `deleted_at` (Soft-Delete).
  Damit kann später ein Server mehrere Geräte über „Änderungen seit `updated_at`“ synchronisieren,
  ohne ID-Konflikte.
- Die Screens greifen nur über die Interfaces in `src/repositories/types.ts` auf Daten zu.
  Für einen Server-Sync wird dort eine weitere Implementierung ergänzt, die UI bleibt unverändert.
- Neue Merkmale (z.B. Person, Auftrag) sind nur Datensätze in `dimensions` – keine Schema-Änderung nötig,
  und die Statistik kann automatisch danach gruppieren.
