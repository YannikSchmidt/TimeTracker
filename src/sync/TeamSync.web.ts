import { newId } from '../db/ids';
import type { BackupData } from '../domain/legacy';
import { BASE_URL } from '../lib/baseUrl';
import { idb } from '../data/idb.web';
import { createMemoryStore, type MemoryStore } from '../repositories/memory';
import { decryptJson, encryptJson } from './crypto';
import { SyncEngine, type SyncBase, type SyncStatus, type TeamMember } from './engine';
import { GitHubStore } from './github';
import { prepareConnect } from './setup';
import type { ConnectInput, ConnectResult } from './TeamContext';

const KEYS = {
  snapshot: 'snapshot',
  sync: 'sync-config',
  key: 'sync-key',
  base: 'sync-base',
  localOnly: 'local-only',
};
const LEGACY_LOCAL_STORAGE = 'timetracker:v1';
const PUSH_DELAY = 3_000;
const POLL_INTERVAL = 60_000;

/** Gespeicherte Verbindung – der Token liegt nur verschlüsselt vor. */
interface SyncConfig {
  repo: string;
  login: string;
  name: string | null;
  /** verschlüsselt mit dem Team-Schlüssel */
  token: string;
}

export interface TeamSyncState {
  available: boolean;
  connected: boolean;
  localOnly: boolean;
  login: string | null;
  name: string | null;
  repo: string | null;
  others: TeamMember[];
  status: SyncStatus;
}

/** Team-Sync nur in der eigenen Web-App (nicht in eingebetteten Vorschauen). */
function syncAvailable(): boolean {
  if (typeof window === 'undefined' || !globalThis.crypto?.subtle) return false;
  const { pathname, hostname } = window.location;
  return pathname.startsWith(BASE_URL) || hostname === 'localhost';
}

const safe = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

function saveSnapshot(snapshot: BackupData): void {
  idb.set(KEYS.snapshot, snapshot).catch(() => {
    // Fallback, falls IndexedDB nicht verfügbar ist (z.B. manche privaten Fenster)
    try {
      globalThis.localStorage?.setItem(LEGACY_LOCAL_STORAGE, JSON.stringify(snapshot));
    } catch {
      // Daten bleiben bis zum Neuladen erhalten
    }
  });
}

/**
 * Lokaler Speicher (IndexedDB) + verschlüsselter Abgleich mit dem Daten-Repo.
 * Läuft außerhalb von React; die Oberfläche abonniert Zustand und Datenänderungen.
 */
export class TeamSync {
  readonly store: MemoryStore;
  private state: TeamSyncState;
  private engine: SyncEngine | null = null;
  private login: string | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly stateListeners = new Set<() => void>();
  private readonly dataListeners = new Set<() => void>();

  private constructor(
    snapshot: BackupData | null,
    private config: SyncConfig | null,
    private readonly key: CryptoKey | null,
    private readonly base: SyncBase | null,
    localOnly: boolean,
  ) {
    this.store = createMemoryStore({
      initial: snapshot,
      makeId: newId,
      owner: () => this.login,
      persist: (data) => {
        saveSnapshot(data);
        this.schedule(PUSH_DELAY);
      },
    });
    this.state = {
      available: syncAvailable(),
      connected: false,
      localOnly,
      login: null,
      name: null,
      repo: null,
      others: [],
      status: { state: 'idle', lastSync: null, error: null },
    };
  }

  /** Gespeicherten Stand laden und ggf. die Verbindung wieder aufnehmen. */
  static async load(): Promise<TeamSync> {
    let snapshot = await safe(idb.get<BackupData>(KEYS.snapshot), undefined);
    if (!snapshot) {
      // Einmalige Übernahme aus dem früheren localStorage-Speicher
      try {
        const raw = globalThis.localStorage?.getItem(LEGACY_LOCAL_STORAGE);
        if (raw) snapshot = JSON.parse(raw) as BackupData;
      } catch {
        // ignorieren
      }
    }
    const sync = new TeamSync(
      snapshot ?? null,
      (await safe(idb.get<SyncConfig>(KEYS.sync), undefined)) ?? null,
      (await safe(idb.get<CryptoKey>(KEYS.key), undefined)) ?? null,
      (await safe(idb.get<SyncBase>(KEYS.base), undefined)) ?? null,
      (await safe(idb.get<boolean>(KEYS.localOnly), undefined)) ?? false,
    );
    if (sync.state.available && sync.config && sync.key) {
      await sync.startEngine(sync.config, sync.key, sync.base).catch(() =>
        sync.setState({ status: { state: 'error', lastSync: null, error: 'Gespeicherte Anmeldung ist ungültig – bitte neu verbinden.' } }),
      );
    }
    return sync;
  }

  // --- Abonnements für React -------------------------------------------------

  getState = (): TeamSyncState => this.state;

  subscribeState = (listener: () => void) => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };

  subscribeData = (listener: () => void) => {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  };

  private setState(patch: Partial<TeamSyncState>) {
    this.state = { ...this.state, ...patch };
    this.stateListeners.forEach((l) => l());
  }

  // --- Abgleich -------------------------------------------------------------

  private schedule(delay: number) {
    if (!this.engine) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.engine?.sync(), delay);
  }

  syncNow = () => {
    void this.engine?.sync();
  };

  private onVisible = () => {
    if (document.visibilityState === 'visible') this.syncNow();
  };

  private async startEngine(cfg: SyncConfig, key: CryptoKey, base: SyncBase | null) {
    const { token } = await decryptJson<{ token: string }>(key, cfg.token);
    this.stopEngine();
    this.login = cfg.login;
    this.config = cfg;
    this.engine = new SyncEngine({
      remote: new GitHubStore(token, cfg.repo),
      key,
      login: cfg.login,
      getLocal: () => this.store.snapshot(),
      applyLocal: (data) => {
        this.store.replace(data);
        this.dataListeners.forEach((l) => l());
      },
      onTeam: (others) => this.setState({ others }),
      onStatus: (status) => this.setState({ status }),
      initialBase: base,
      saveBase: (b) => void idb.set(KEYS.base, b).catch(() => {}),
    });
    this.setState({ connected: true, localOnly: false, login: cfg.login, name: cfg.name, repo: cfg.repo });
    this.pollTimer = setInterval(this.syncNow, POLL_INTERVAL);
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
    this.syncNow();
  }

  private stopEngine() {
    this.engine = null;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onVisible);
  }

  // --- Verbinden / Abmelden ---------------------------------------------------

  connect = async (input: ConnectInput): Promise<ConnectResult> => {
    const token = input.token.trim();
    const remote = new GitHubStore(token, input.repo);
    const result = await prepareConnect(remote, input.password, input.createPassword ?? false);
    if (!result.ok) return result;
    const cfg: SyncConfig = {
      repo: input.repo,
      login: result.user.login,
      name: result.user.name,
      token: await encryptJson(result.key, { token }),
    };
    try {
      await idb.set(KEYS.key, result.key);
      await idb.set(KEYS.sync, cfg);
      await idb.delete(KEYS.base);
      await idb.set(KEYS.localOnly, false);
    } catch {
      return { ok: false, error: 'Die Anmeldung konnte auf diesem Gerät nicht gespeichert werden (privates Fenster?).' };
    }
    await this.startEngine(cfg, result.key, null);
    return { ok: true };
  };

  disconnect = async () => {
    this.stopEngine();
    this.login = null;
    this.config = null;
    await Promise.all([idb.delete(KEYS.key), idb.delete(KEYS.sync), idb.delete(KEYS.base)]).catch(() => {});
    this.setState({
      connected: false,
      login: null,
      name: null,
      repo: null,
      others: [],
      status: { state: 'idle', lastSync: null, error: null },
    });
  };

  setLocalOnly = (value: boolean) => {
    this.setState({ localOnly: value });
    void idb.set(KEYS.localOnly, value).catch(() => {});
  };
}
