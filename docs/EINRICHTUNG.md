# TimeTracker einrichten (Web-App + Team-Sync)

Die App läuft als **Web-App** (PWA) auf GitHub Pages und lässt sich auf iPhone und Android wie eine normale App
auf den Home-Bildschirm legen – ohne App Store. Die Daten liegen **verschlüsselt** in einem **privaten**
GitHub-Repo des Teams. Alle Schritte gehen auch am Handy im Browser.

```
github.io/TimeTracker (öffentlich, nur App-Code)  ──►  App auf dem Handy (Daten lokal, offline nutzbar)
                                                        │  verschlüsselt mit dem Team-Passwort
                                                        ▼
TimeTracker-Data/TimeTracker-Daten (privat)   meta.json · shared.enc · people/<login>.enc · Issues = Vorschläge
```

## 1. Einmalig: App veröffentlichen (Besitzer des Code-Repos)

1. **Repo öffentlich machen:** github.com/YannikSchmidt/TimeTracker → *Settings* → *General* → ganz unten
   *Change visibility* → *Public*. (Der Code ist öffentlich, die Daten nicht – die liegen im privaten Daten-Repo.)
2. **Pages aktivieren:** *Settings* → *Pages* → *Source*: **GitHub Actions**.
3. **Auf `main` bringen:** Den Entwicklungs-Branch nach `main` mergen. Der Workflow
   „Web-App veröffentlichen“ baut die App und stellt sie bereit unter
   **https://yannikschmidt.github.io/TimeTracker/**

## 2. Einmalig: Team und Daten-Repo (Organisations-Owner)

1. **Organisation:** `TimeTracker-Data` (github.com/TimeTracker-Data).
2. **Privates Daten-Repo anlegen:** github.com/organizations/TimeTracker-Data/repositories/new →
   Name `TimeTracker-Daten`, **Private**, „Add a README file“ anhaken → *Create repository*.
   (Issues sind bei neuen Repos automatisch eingeschaltet – dort landen die Verbesserungsvorschläge.)
3. **Token-Freigabe:** Organisation → *Settings* → *Personal access tokens*. Fine-grained Tokens erlauben; falls
   „Require approval“ aktiv ist, Anfragen unter *Pending requests* genehmigen (oder die Genehmigung ausschalten).

## 3. Einmalig: du verbindest dich und legst das Team-Passwort fest

Du (mit GitHub-Konto) brauchst einen **persönlichen Token**: GitHub → *Settings* → *Developer settings* →
*Personal access tokens* → **Fine-grained tokens** → *Generate new token* (der Link „Token auf GitHub erstellen“ in der
App füllt das meiste vor):

| Feld | Wert |
|---|---|
| Resource owner | **TimeTracker-Data** |
| Repository access | *Only select repositories* → `TimeTracker-Daten` |
| Permissions → Repository → **Contents** | **Read and write** (Zeitdaten) |
| Permissions → Repository → **Issues** | **Read and write** (Verbesserungsvorschläge) |
| Expiration | z.B. 1 Jahr |

Den Token (`github_pat_…`) gleich kopieren – GitHub zeigt ihn nur einmal an. Dann in der App:
*Mit dem Team verbinden* → **Einrichten** → **Eigener GitHub-Token** → Token und **Team-Passwort** eingeben.
Als erste Person legst du das Team-Passwort fest (mindestens 8 Zeichen, zweimal eingeben).

## 4. Kollegen einladen – ohne GitHub-Konto

1. Einmalig einen **Team-Token** erstellen: genauso wie oben, Name z.B. „TimeTracker Team“. Er ist der gemeinsame
   Zugang aller Eingeladenen. (Alternativ kannst du deinen eigenen Token teilen – dann laufen deren Änderungen auf
   GitHub unter deinem Konto, und wenn du deinen Token erneuerst, brauchen alle eine neue Einladung.)
2. In der App: *Einstellungen* → *Team-Sync* → **Kollegen einladen (QR-Code)** → Team-Token einfügen →
   **QR-Code erstellen**. Den QR-Code zeigen oder den Link schicken.
3. Die Kollegin/der Kollege:
   - öffnet **https://yannikschmidt.github.io/TimeTracker/** und legt die App auf den Home-Bildschirm
     (iPhone: Teilen → *Zum Home-Bildschirm*; Android: ⋮ → *App installieren*),
   - startet die App vom Home-Bildschirm → *Mit dem Team verbinden* → **Einrichten** → **Mit Einladung**,
   - scannt den QR-Code (oder fügt den Link ein), gibt den **eigenen Namen** und das **Team-Passwort** ein.
4. Das **Team-Passwort persönlich sagen** – nicht zusammen mit dem Link verschicken. Die Einladung allein nützt
   niemandem: Der Token darin ist mit dem Team-Passwort verschlüsselt.

Auf GitHub erscheinen Änderungen von Eingeladenen unter dem Konto des Team-Tokens, mit dem Namen der Person in der
Beschreibung (z.B. „Max Müller (max-mueller): Aufträge aktualisiert“). In der App sieht man überall den Namen.
Wer ein eigenes GitHub-Konto hat, kann sich weiterhin mit eigenem Token verbinden – beides geht gemischt.

**Gerät verloren?** Den Team-Token auf GitHub löschen, einen neuen erstellen, neue Einladung an alle schicken
(die Daten bleiben erhalten). Bei eigenem Token reicht es, diesen einen zu löschen.

**Neues Gerät für dieselbe Person:** einfach erneut mit der Einladung und **genau demselben Namen** verbinden – die App
fragt nach („Bist du das auf einem weiteren Gerät?“) und führt die Daten zusammen.

## Sicherheit

- Verschlüsselung im Gerät: AES-256-GCM, Schlüssel per PBKDF2-SHA256 (600 000 Runden) aus dem Team-Passwort.
  GitHub (und jeder, der das Repo sieht) sieht nur verschlüsselte Daten sowie wer wann etwas geändert hat.
- Einladungen (QR-Code/Link) enthalten den Team-Token nur verschlüsselt; der Code steht hinter „#“ und wird beim
  Öffnen des Links nicht an einen Server gesendet.
- Bei Einladungen ist der Name nicht fälschungssicher: Wer Einladung und Team-Passwort hat, könnte sich einen
  beliebigen Namen geben. Für eindeutig nachweisbare Änderungen eigene GitHub-Konten verwenden.
- Das Passwort wird nie gespeichert oder übertragen. Auf dem Gerät liegt nur der daraus abgeleitete Schlüssel
  (nicht auslesbar) und der damit verschlüsselte Token.
- **Passwort vergessen = Daten nicht mehr lesbar.** Passwort sicher aufbewahren (z.B. Passwort-Manager).
- Gerät verloren: Token auf GitHub löschen (*Personal access tokens* → *Delete*); damit kann das Gerät nicht mehr
  synchronisieren. Am Gerät selbst: *Einstellungen* → *Dieses Gerät abmelden*.

## Wer darf was?

- **Datenschutz:** Jede Person sieht in Verlauf und Statistik nur ihre eigenen Aufträge und Zeiten und bearbeitet nur
  diese. Zeiten anderer werden nirgends angezeigt. Die Statistik zeigt höchstens ein Lob, wenn man im Zeitraum am
  schnellsten bzw. bei den Schnelleren im Team war (gemessen an der Vorgabe) – Langsamere sehen dazu nichts.
  Technisch liegen die Daten weiterhin verschlüsselt im gemeinsamen Daten-Repo (nötig für Sync, Vorschläge und die
  Aufteilung der Vorgabe); die App zeigt sie nur nicht an.
- Artikel und Merkmale (Projekt, Tags, …) sind gemeinsam und von allen änderbar.
- Vorschläge (Aufträge, Artikel, Stückzahl, Nacharbeitsgründe) nutzen die Eingaben des ganzen Teams.

## Abläufe und Arbeitsschritte

*Artikel* → „Abläufe & Untergruppen bearbeiten“:
- **Gesamtgeräte** und **Fronten / Einzelteile** sind getrennt. Je Hauptgruppe gibt es einen **Standard-Ablauf**
  (Schritte in Reihenfolge, verschiebbar).
- **Untergruppen** (z.B. „Kühlschrank“) können einen eigenen Ablauf haben; leer = Standard-Ablauf.
- Die Hauptgruppe eines Artikels ergibt sich aus der Nummer (07… / 500000…); die Untergruppe wählt man im Artikel.

Im Timer zeigt die Kachel den aktuellen Schritt; „<Schritt> fertig → <nächster>“ schließt ihn ab, die Zeit läuft
nahtlos im nächsten Schritt weiter. Beim letzten Schritt beendet „Fertig“ den Auftrag. Beim Start kann man statt des
ganzen Ablaufs „Nur <Schritt>“ wählen (z.B. beim Aushelfen).

## Vorgabezeiten

Im Artikel unter *Vorgabezeiten* je Arbeitsschritt **Rüsten** (Minuten, einmal pro Auftrag) und **je Stück**
(Minuten pro Stück) eintragen; ohne Ablauf gibt es eine Zeile „Ganzer Auftrag“. Vorgabe = Summe aus Rüstzeit +
Einzelzeit × Stückzahl. Verglichen wird mit der Zeit, in der der Timer lief: in der Kachel (rot = über Vorgabe), im
abgeschlossenen Auftrag je Schritt und in der Statistik je Untergruppe und Artikel.

## Mehrere Personen an einem Auftrag

- **Jede Person trackt selbst** (empfohlen): Alle starten einen Timer auf dieselbe Auftragsnummer (und denselben
  Artikel). Die Kachel zeigt „Auch am Auftrag: …“, die Auftragsansicht die Namen der Beteiligten (ohne deren
  Zeiten). Die Vorgabe wird im Verhältnis der geleisteten Zeit aufgeteilt: 15 h Vorgabe, A arbeitet 8 h und B 2 h →
  A bekommt 12 h und B 3 h gutgeschrieben. Kachel, Auftragsansicht und Statistik zeigen jeweils den eigenen Anteil.
- **Eine Person trackt für mehrere**: Personenzähler beim Start oder in der Kachel (− / +). Die Zeit zählt ab dann
  mal Personen (Personenzeit); ändert sich die Zahl, gilt die neue Anzahl ab diesem Moment.

## Admin und Löschen

Löschen dürfen nur Admins (Liste `ADMINS` in `src/sync/config.ts`, derzeit `YannikSchmidt`). Alle anderen sehen
„… löschen (vorschlagen)“ und geben einen Grund an. Unter *Einstellungen* → *Löschvorschläge* entscheidet der Admin
(*Löschen* / *Ablehnen*). Artikel löscht der Admin sofort; Aufträge anderer Personen werden beim nächsten Abgleich auf
deren Gerät gelöscht (nur sie schreiben in ihre eigene Datei). Die Regel gilt in der App – technisch könnte jemand mit
Team-Passwort und Token sie umgehen.

## Verbesserungsvorschläge

In der App: *Timer* → ganz unten „Verbesserung vorschlagen“ (oder *Einstellungen* → *Feedback*). Kategorie wählen
(Idee / Fehler / Sonstiges), Text schreiben, *Senden*. Der Vorschlag wird ein **Issue** im privaten Daten-Repo
(Label `vorschlag`, dazu `idee` bzw. `fehler`) – mit Autor, App-Version und Gerätetyp. Unter „Meine Vorschläge“ sieht
man den Status (offen/erledigt) und kommt per Tipp zum Issue.

- Bearbeiten: github.com/TimeTracker-Data/TimeTracker-Daten/issues – kommentieren, zuweisen, schließen.
- Ohne Netz wird der Vorschlag vorgemerkt und automatisch nachgesendet.
- Vorschläge sind **nicht verschlüsselt** (anders als die Zeitdaten), aber nur für Mitglieder des privaten Repos sichtbar.

## Updates

Neue Versionen müssen **nicht neu installiert** werden. Sobald etwas auf `main` landet, baut GitHub die Web-App neu
(ca. 2–3 Minuten). Die App prüft beim Öffnen, beim Zurückkehren und alle 30 Minuten, ob es eine neue Version gibt:

- Direkt nach dem Öffnen oder sobald die App im Hintergrund ist, lädt sie die neue Version automatisch.
- Ist sie gerade in Benutzung, erscheint oben „Neue Version verfügbar – Jetzt aktualisieren“.
- Laufende Timer und alle Daten bleiben dabei erhalten. Die aktuelle Version steht unter *Einstellungen* → *App*.

## Offline

Die App startet auch ohne Netz und speichert alles lokal. Sobald wieder Verbindung besteht, wird automatisch
abgeglichen (spätestens nach einer Minute oder beim Öffnen der App; Tippen auf die Sync-Zeile gleicht sofort ab).
