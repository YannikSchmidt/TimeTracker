import { useState, type ReactNode } from 'react';

import { newId } from '../db/ids';
import { createMemoryRepositories } from '../repositories/memory';
import type { BackupData } from '../repositories/types';
import { DataProvider } from './DataProvider';

const STORAGE_KEY = 'timetracker:v1';

function load(): BackupData | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BackupData) : null;
  } catch {
    return null;
  }
}

function save(snapshot: BackupData): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Speicher blockiert (z.B. privates Fenster) – Daten bleiben bis zum Neuladen erhalten.
  }
}

/**
 * Browser-Version: Daten im Speicher, gesichert im localStorage des Browsers.
 * (SQLite im Browser bräuchte spezielle Server-Header, die nicht überall verfügbar sind.)
 */
export function StorageRoot({ children }: { children: ReactNode }) {
  const [repos] = useState(() => createMemoryRepositories({ initial: load(), persist: save, makeId: newId }));
  return <DataProvider repos={repos}>{children}</DataProvider>;
}
