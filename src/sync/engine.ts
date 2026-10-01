import type { BackupData } from '../domain/legacy';
import {
  joinSnapshot,
  mergePerson,
  mergeShared,
  splitSnapshot,
  type PersonData,
  type SharedData,
} from '../domain/merge';
import type { Entry, Job, Millis } from '../domain/types';
import { decryptJson, encryptJson } from './crypto';
import { ConflictError, RemoteError, type RemoteStore } from './remote';

export const PATHS = {
  meta: 'meta.json',
  shared: 'shared.enc',
  peopleDir: 'people',
  person: (login: string) => `people/${login}.enc`,
};

/** Daten einer anderen Person – nur lesbar. */
export interface TeamMember {
  login: string;
  jobs: Job[];
  entries: Entry[];
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error';
  lastSync: Millis | null;
  error: string | null;
}

export interface SyncEngineOptions {
  remote: RemoteStore;
  key: CryptoKey;
  login: string;
  /** Aktueller lokaler Stand */
  getLocal: () => BackupData;
  /** Zusammengeführten Stand lokal übernehmen */
  applyLocal: (data: BackupData) => void;
  onTeam: (members: TeamMember[]) => void;
  onStatus: (status: SyncStatus) => void;
  now?: () => Millis;
  /** Zuletzt abgeglichener Stand (z.B. aus IndexedDB), damit der Drei-Wege-Abgleich nach Neustart weiter funktioniert */
  initialBase?: SyncBase | null;
  saveBase?: (base: SyncBase) => void;
}

export interface SyncBase {
  person: PersonData;
  shared: SharedData;
}

/** Arrays nach ID sortieren, damit gleicher Inhalt gleich serialisiert wird. */
function canonical<T>(value: T): string {
  return JSON.stringify(value, (_k, v) =>
    Array.isArray(v) && v.every((x) => x && typeof x === 'object' && typeof x.id === 'string')
      ? [...v].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      : v,
  );
}

/**
 * Gleicht den lokalen Stand mit dem Daten-Repo ab:
 * eigene Datei und gemeinsame Datei laden → zusammenführen → lokal übernehmen → hochladen,
 * danach die Dateien der anderen Personen (nur bei Änderung) laden.
 */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private readonly others = new Map<string, { sha: string; member: TeamMember }>();
  private status: SyncStatus = { state: 'idle', lastSync: null, error: null };
  /** Letzter mit dem Server abgeglichener Stand – Basis für den Drei-Wege-Abgleich */
  private base: SyncBase | null;

  constructor(private readonly o: SyncEngineOptions) {
    this.base = o.initialBase ?? null;
  }

  private now(): Millis {
    return this.o.now?.() ?? Date.now();
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.o.onStatus(this.status);
  }

  /** Abgleich starten; läuft schon einer, folgt direkt danach ein weiterer. */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.runWithRetry();
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async runWithRetry() {
    this.setStatus({ state: 'syncing' });
    for (let attempt = 0; ; attempt++) {
      try {
        await this.syncOnce();
        this.setStatus({ state: 'idle', lastSync: this.now(), error: null });
        return;
      } catch (e) {
        if (e instanceof ConflictError && attempt < 4) continue; // jemand war schneller → neu laden und zusammenführen
        const message =
          e instanceof RemoteError || e instanceof ConflictError
            ? e.message
            : (e as { name?: string } | null)?.name === 'OperationError'
              ? 'Daten konnten nicht entschlüsselt werden – stimmt das Team-Passwort?'
              : `Synchronisieren fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
        this.setStatus({ state: 'error', error: message });
        return;
      }
    }
  }

  private async syncOnce() {
    const { remote, key, login } = this.o;
    const ownPath = PATHS.person(login);
    const [ownFile, sharedFile] = await Promise.all([remote.read(ownPath), remote.read(PATHS.shared)]);
    const remoteOwn = ownFile ? await decryptJson<PersonData>(key, ownFile.text) : null;
    const remoteShared = sharedFile ? await decryptJson<SharedData>(key, sharedFile.text) : null;

    const local = splitSnapshot(this.o.getLocal(), login);
    const person = mergePerson(local.person, remoteOwn, this.now(), this.base?.person ?? null);
    const shared = mergeShared(local.shared, remoteShared, this.base?.shared ?? null);

    // Lokal übernehmen – dabei Änderungen, die während des Ladens gemacht wurden, erhalten
    const latest = splitSnapshot(this.o.getLocal(), login);
    const finalPerson = mergePerson(latest.person, person, this.now(), local.person);
    const finalShared = mergeShared(latest.shared, shared, local.shared);
    if (canonical(finalPerson) !== canonical(latest.person) || canonical(finalShared) !== canonical(latest.shared)) {
      this.o.applyLocal(joinSnapshot(finalPerson, finalShared));
    }
    if (canonical(finalPerson) !== canonical(person) || canonical(finalShared) !== canonical(shared)) this.again = true;

    // Hochladen, wenn sich etwas gegenüber dem Server geändert hat
    if (!remoteOwn || canonical(person) !== canonical(remoteOwn)) {
      await remote.write(ownPath, await encryptJson(key, person), ownFile?.sha ?? null, `${login}: Aufträge aktualisiert`);
    }
    if (!remoteShared || canonical(shared) !== canonical(remoteShared)) {
      await remote.write(PATHS.shared, await encryptJson(key, shared), sharedFile?.sha ?? null, `${login}: Artikel/Merkmale aktualisiert`);
    }
    this.base = { person, shared };
    this.o.saveBase?.(this.base);

    await this.pullOthers();
  }

  private async pullOthers() {
    const { remote, key, login } = this.o;
    const files = await remote.list(PATHS.peopleDir);
    const seen = new Set<string>();
    for (const f of files) {
      if (!f.name.endsWith('.enc')) continue;
      const who = f.name.slice(0, -'.enc'.length);
      if (who === login) continue;
      seen.add(who);
      if (this.others.get(who)?.sha === f.sha) continue;
      const file = await remote.read(f.path);
      if (!file) continue;
      const data = await decryptJson<PersonData>(key, file.text);
      this.others.set(who, {
        sha: file.sha,
        member: {
          login: who,
          // Ältere Aufträge ohne Besitzer gehören der Person, deren Datei es ist
          jobs: data.jobs.map((j) => ({ ...j, createdBy: j.createdBy ?? who })),
          entries: data.entries,
        },
      });
    }
    for (const who of [...this.others.keys()]) if (!seen.has(who)) this.others.delete(who);
    this.o.onTeam([...this.others.values()].map((o) => o.member).sort((a, b) => a.login.localeCompare(b.login)));
  }
}
