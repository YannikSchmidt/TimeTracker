# TimeTracker einrichten (Web-App + Team-Sync)

Die App läuft als **Web-App** (PWA) auf GitHub Pages und lässt sich auf iPhone und Android wie eine normale App
auf den Home-Bildschirm legen – ohne App Store. Die Daten liegen **verschlüsselt** in einem **privaten**
GitHub-Repo des Teams. Alle Schritte gehen auch am Handy im Browser.

```
github.io/TimeTracker (öffentlich, nur App-Code)  ──►  App auf dem Handy (Daten lokal, offline nutzbar)
                                                        │  verschlüsselt mit dem Team-Passwort
                                                        ▼
<organisation>/TimeTracker-Daten (privat)   meta.json · shared.enc · people/<login>.enc
```

## 1. Einmalig: App veröffentlichen (Besitzer des Code-Repos)

1. **Repo öffentlich machen:** github.com/YannikSchmidt/TimeTracker → *Settings* → *General* → ganz unten
   *Change visibility* → *Public*. (Der Code ist öffentlich, die Daten nicht – die liegen im privaten Daten-Repo.)
2. **Pages aktivieren:** *Settings* → *Pages* → *Source*: **GitHub Actions**.
3. **Auf `main` bringen:** Den Entwicklungs-Branch nach `main` mergen. Der Workflow
   „Web-App veröffentlichen“ baut die App und stellt sie bereit unter
   **https://yannikschmidt.github.io/TimeTracker/**

## 2. Einmalig: Team und Daten-Repo (Organisations-Owner)

1. **Organisation anlegen:** github.com/account/organizations/new → Plan *Free*.
2. **Privates Daten-Repo** `TimeTracker-Daten` in der Organisation anlegen (oder anlegen lassen).
3. **Mitglieder einladen:** Organisation → *People* → *Invite member*. Jedes Mitglied braucht Schreibrecht auf
   `TimeTracker-Daten` (z.B. über ein Team oder direkt im Repo unter *Settings* → *Collaborators and teams*).
4. **Token-Freigabe:** Organisation → *Settings* → *Personal access tokens*. Fine-grained Tokens erlauben; falls
   „Require approval“ aktiv ist, Anfragen unter *Pending requests* genehmigen.

## 3. Jede Person: persönlicher Token

GitHub → *Settings* → *Developer settings* → *Personal access tokens* → **Fine-grained tokens** → *Generate new token*
(der Link „Token auf GitHub erstellen“ in der App füllt das meiste vor):

| Feld | Wert |
|---|---|
| Resource owner | die Organisation |
| Repository access | *Only select repositories* → `TimeTracker-Daten` |
| Permissions → Repository → **Contents** | **Read and write** |
| Expiration | z.B. 1 Jahr (danach neuen Token erstellen und in der App neu verbinden) |

Den Token (`github_pat_…`) gleich in die App kopieren – GitHub zeigt ihn nur einmal an.
Jede Person nutzt **ihren eigenen** Token: Jede Änderung ist dadurch im Daten-Repo als Commit dieser Person sichtbar.

## 4. Jede Person: App installieren und verbinden

1. **https://yannikschmidt.github.io/TimeTracker/** öffnen.
   - **iPhone (Safari):** Teilen-Symbol → *Zum Home-Bildschirm*.
   - **Android (Chrome):** Menü ⋮ → *App installieren* bzw. *Zum Startbildschirm hinzufügen*.
2. App vom Home-Bildschirm starten → *Mit dem Team verbinden* → **Einrichten**.
3. Daten-Repo (`organisation/TimeTracker-Daten`), Token und **Team-Passwort** eingeben.
   - Die **erste** Person legt das Team-Passwort fest (mindestens 8 Zeichen, zweimal eingeben).
   - Alle anderen geben dasselbe Passwort ein. Es wird **nur einmal pro Gerät** abgefragt.
4. Kamera-Zugriff erlauben, wenn die App beim ersten Scan danach fragt.

## Sicherheit

- Verschlüsselung im Gerät: AES-256-GCM, Schlüssel per PBKDF2-SHA256 (600 000 Runden) aus dem Team-Passwort.
  GitHub (und jeder, der das Repo sieht) sieht nur verschlüsselte Daten sowie wer wann etwas geändert hat.
- Das Passwort wird nie gespeichert oder übertragen. Auf dem Gerät liegt nur der daraus abgeleitete Schlüssel
  (nicht auslesbar) und der damit verschlüsselte Token.
- **Passwort vergessen = Daten nicht mehr lesbar.** Passwort sicher aufbewahren (z.B. Passwort-Manager).
- Gerät verloren: Token auf GitHub löschen (*Personal access tokens* → *Delete*); damit kann das Gerät nicht mehr
  synchronisieren. Am Gerät selbst: *Einstellungen* → *Dieses Gerät abmelden*.

## Wer darf was?

- Alle sehen alle Aufträge (Verlauf/Statistik → Filter *Ich / Person / Alle*), bearbeiten aber nur ihre eigenen.
- Artikel und Merkmale (Projekt, Tags, …) sind gemeinsam und von allen änderbar.
- Vorschläge (Aufträge, Artikel, Stückzahl, Nacharbeitsgründe) nutzen die Eingaben des ganzen Teams.

## Offline

Die App startet auch ohne Netz und speichert alles lokal. Sobald wieder Verbindung besteht, wird automatisch
abgeglichen (spätestens nach einer Minute oder beim Öffnen der App; Tippen auf die Sync-Zeile gleicht sofort ab).
