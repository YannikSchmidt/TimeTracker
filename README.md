# TimeTracker

Zeiterfassung für Aufträge – als **Web-App (PWA)** für iPhone und Android, ohne App Store:
**https://yannikschmidt.github.io/TimeTracker/** (→ „Zum Home-Bildschirm“).

Daten liegen lokal auf dem Gerät (offline nutzbar) und werden – wenn eingerichtet – **verschlüsselt** über ein
privates GitHub-Repo mit dem Team abgeglichen. Einrichtung: **[docs/EINRICHTUNG.md](docs/EINRICHTUNG.md)**.

Gebaut mit [Expo](https://expo.dev) / React Native und TypeScript; dieselbe Codebasis läuft auch als native App
(dort aktuell nur lokal, SQLite).

## Funktionen

- **Aufträge als Timer-Liste**: Mehrere Aufträge können offen sein, aber immer läuft nur einer. Jeder Auftrag hat
  seine eigene Farbe; Nacharbeit läuft in der Kachel ihres Auftrags.
  Starten oder Fortsetzen eines Auftrags pausiert automatisch den laufenden. Jeder Auftrag ist pausierbar.
- **Start mit Scan zuerst**: „Neuer Auftrag“ → Strichcodes in beliebiger Reihenfolge scannen. Die App erkennt am
  Aufbau, was es ist (Auftrag `25/26/27*****`, Gesamtgerät `07******`, Front/Einzelteil `500000****` – in den
  Einstellungen änderbar) und fragt, ob die nächste Nummer gescannt werden soll. Ist der Auftrag schon bekannt, werden
  Artikel und Stückzahl übernommen. Eintippen (Nummer oder Bezeichnung) und „ohne Auftrag/Artikel“ gehen jederzeit;
  Artikel lassen sich auch nur mit Bezeichnung anlegen.
- **Arbeitsschritte**: Gesamtgeräte und Fronten mit Untergruppen; jede Gruppe hat einen frei bearbeitbaren Ablauf
  (z.B. Teile holen → Gesamtmontage → Prüfen). Im Timer schließt „Schritt fertig“ den Schritt ab und startet den
  nächsten; die Zeit pro Schritt steht im Auftrag. Beim Start kann auch nur ein einzelner Schritt getrackt werden.
- **Vorschläge aus früheren Eingaben**: zuletzt verwendete Auftragsnummern, häufige Artikel, Stückzahl
  (häufigste des Artikels, sonst Standard 24 – einstellbar) und bisherige Nacharbeitsgründe.
- **Nacharbeit**: eigener Timer zu einem Auftrag (offen oder abgeschlossen). Beim Beenden wird der Grund
  eingetragen – bisherige Gründe stehen als Vorschlag bereit.
- **Abschluss**: zeigt die **Arbeitszeit** (Timer lief) groß, dazu Gesamtzeit (erster Start bis Abschluss),
  Pausen und die Nacharbeit.
- **Verlauf**: Aufträge nach Tag mit Arbeitszeit, Gesamtzeit und Nacharbeit; Arbeitsabschnitte einzeln korrigierbar,
  Aufträge nachtragbar.
- **Artikel**: eigener Tab, getrennt nach Gesamtgeräten, Fronten und Sonstigen; Suche, Scan, Nummer, Benennung,
  Endgerät (freie Notiz) und Untergruppe. Beim Start lässt sich
  der Artikel auch über die Benennung suchen.
- **Timer-Namen** aus Auftragsnummer und Benennung, z.B. „A-2026-0815 · Halter links“.
- **Statistik** (Woche/Monat/Jahr): Arbeitszeit inkl. Anteil Nacharbeit, Soll/Ist, Aufträge, Verteilung nach
  Artikel/Auftrag/Merkmal, Artikel & Stückzahlen (Zeit, Nacharbeit, Stück, Min/Stück), Nacharbeit nach Grund, Verlauf.
- **Team-Sync** (Web-App): verschlüsselt (AES-256, Team-Passwort) über ein privates GitHub-Repo; persönlicher Token
  pro Person, damit jede Änderung nachvollziehbar ist. Alle sehen alles (Filter *Ich / Person / Alle*),
  bearbeiten aber nur ihre eigenen Aufträge. Offline nutzbar, Abgleich automatisch.
- **Löschen nur durch den Admin**: alle anderen schlagen Löschungen mit Begründung vor; der Admin entscheidet in den
  Einstellungen. Bestätigte Löschungen fremder Aufträge führt das Gerät der Besitzerin/des Besitzers aus.
- **Kollegen einladen per QR-Code**: kein GitHub-Konto nötig – QR scannen, Name und Team-Passwort eingeben.
- **Verbesserungsvorschläge** aus der App → Issues im privaten Daten-Repo (offline vorgemerkt).
- **Automatische Updates**: keine Neuinstallation; die App lädt neue Versionen selbst (im Hintergrund oder per Hinweis).
- **Scanner**: Live-Kamera (App und Web-App), alternativ per Foto.
- **Einstellungen**: Sollstunden, Arbeitstage, Standard-Stückzahl, Merkmale, Team-Sync, CSV-Export pro Auftrag, JSON-Backup.

## Entwickeln und testen

Voraussetzung: [Node.js](https://nodejs.org) (LTS) auf dem Rechner, die App **Expo Go** auf dem Handy
([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779)).

```bash
npm install
npx expo start
```

Den angezeigten QR-Code mit Expo Go (Android) bzw. der Kamera-App (iPhone) scannen. Handy und Rechner müssen im
selben WLAN sein – sonst `npx expo start --tunnel` verwenden.

### Web-App lokal

```bash
npx expo start --web     # Entwicklung im Browser (http://localhost:8081/TimeTracker/)
npx expo export -p web   # Build wie auf GitHub Pages → dist/
```

Bei jedem Push auf `main` baut `.github/workflows/pages.yml` die Web-App und veröffentlicht sie auf GitHub Pages.

### Einzelne HTML-Datei (Vorschau)

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
  sync/                Team-Sync: Verschlüsselung, GitHub-Client, Sync-Engine, Einrichtung
  domain/              Reine Logik ohne UI: Zeit, Statistik, CSV-Export (mit Tests)
  repositories/        Interfaces + SQLite-Implementierung
```

### Datenmodell & späterer Server-Sync

- `jobs` (Auftrag bzw. Nacharbeit: Status, Artikel, Auftragsnummer, Stückzahl, Grund, Start/Abschluss),
  `entries` (Arbeitsabschnitte eines Auftrags: Start, Ende – `NULL` = läuft), `articles`, `dimensions` (Merkmale),
  `dimension_values`, `job_values` (Zuordnung n:m), `settings`.
- Alle Datensätze haben UUIDs sowie `created_at`, `updated_at` und `deleted_at` (Soft-Delete).
- Team-Sync (Web): pro Person eine verschlüsselte Datei `people/<login>.enc` (nur sie schreibt),
  gemeinsame Daten in `shared.enc`. Abgleich per Drei-Wege-Merge pro Feld (Basis = letzter gemeinsamer Stand),
  Konflikte beim Schreiben werden über die Datei-SHA erkannt und automatisch neu zusammengeführt.
- Die Screens greifen nur über die Interfaces in `src/repositories/types.ts` auf Daten zu.
  Für einen Server-Sync wird dort eine weitere Implementierung ergänzt, die UI bleibt unverändert.
- Neue Merkmale (z.B. Person, Auftrag) sind nur Datensätze in `dimensions` – keine Schema-Änderung nötig,
  und die Statistik kann automatisch danach gruppieren.
