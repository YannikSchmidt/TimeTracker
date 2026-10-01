import { useSyncExternalStore } from 'react';

import { BASE_URL } from './baseUrl';
import { APP_VERSION, isNewer } from './version';
import type { UpdateState } from './updates';

export type { UpdateState } from './updates';

/**
 * Automatische Updates der Web-App: Nach jedem Veröffentlichen liegt auf dem Server eine neue
 * `version.json`. Die App prüft beim Start, beim Zurückkehren und alle 30 Minuten.
 * Ist eine neue Version da, lädt sie neu, sobald die App im Hintergrund ist (man merkt nichts);
 * solange sie offen ist, zeigt ein Hinweis „Jetzt aktualisieren“. Daten bleiben erhalten (IndexedDB).
 */
const CHECK_INTERVAL = 30 * 60_000;
/** Direkt nach dem Start darf sofort neu geladen werden – da wurde noch nichts eingegeben. */
const STARTUP_WINDOW = 10_000;
const RELOADED_KEY = 'timetracker:update-reloaded';

let state: UpdateState = {
  supported: typeof window !== 'undefined' && window.location.pathname.startsWith(BASE_URL) && APP_VERSION !== 'dev',
  available: null,
  checking: false,
  lastCheck: null,
};
const listeners = new Set<() => void>();
const startedAt = Date.now();
let started = false;

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Neu laden – höchstens einmal pro neuer Version, falls der Server noch die alte ausliefert. */
function reload(version: string) {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === version) return;
    sessionStorage.setItem(RELOADED_KEY, version);
  } catch {
    // ohne sessionStorage trotzdem neu laden
  }
  window.location.reload();
}

export async function checkForUpdate(): Promise<void> {
  if (!state.supported || state.checking) return;
  setState({ checking: true });
  try {
    const res = await fetch(`${BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    const remote = res.ok ? ((await res.json()) as { version?: string }).version : null;
    if (isNewer(remote)) {
      setState({ available: remote! });
      void navigator.serviceWorker?.getRegistration(BASE_URL).then((r) => r?.update()).catch(() => {});
      if (Date.now() - startedAt < STARTUP_WINDOW || document.visibilityState === 'hidden') reload(remote!);
    }
  } catch {
    // offline – beim nächsten Mal
  } finally {
    setState({ checking: false, lastCheck: Date.now() });
  }
}

export function applyUpdate(): void {
  if (state.available) {
    try {
      sessionStorage.removeItem(RELOADED_KEY);
    } catch {
      // egal
    }
    reload(state.available);
  }
}

export function setupUpdates(): void {
  if (started || !state.supported) return;
  started = true;
  void checkForUpdate();
  setInterval(() => void checkForUpdate(), CHECK_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (state.available) reload(state.available);
    } else {
      void checkForUpdate();
    }
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getState = () => state;

export function useAppUpdate(): UpdateState & { check: () => Promise<void>; apply: () => void } {
  const s = useSyncExternalStore(subscribe, getState, getState);
  return { ...s, check: checkForUpdate, apply: applyUpdate };
}
