import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { createSqliteRepositories } from '../repositories/sqlite';
import type { Repositories } from '../repositories/types';

interface DataContextValue {
  repos: Repositories;
  /** Zählt bei jeder Änderung hoch, damit Abfragen neu laden. */
  version: number;
  /** Führt eine Schreiboperation aus und lädt danach alle Ansichten neu. */
  mutate: <T>(fn: (repos: Repositories) => Promise<T>) => Promise<T>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const repos = useMemo(() => createSqliteRepositories(db), [db]);
  const [version, setVersion] = useState(0);

  const mutate = useCallback(
    async <T,>(fn: (r: Repositories) => Promise<T>) => {
      try {
        return await fn(repos);
      } finally {
        setVersion((v) => v + 1);
      }
    },
    [repos],
  );

  const value = useMemo(() => ({ repos, version, mutate }), [repos, version, mutate]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData muss innerhalb von <DataProvider> verwendet werden.');
  return ctx;
}

/**
 * Lädt Daten über die Repositories und lädt automatisch neu, wenn sich
 * Daten ändern (mutate) oder sich `deps` ändern.
 */
export function useQuery<T>(loader: (repos: Repositories) => Promise<T>, deps: unknown[] = []) {
  const { repos, version } = useData();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let cancelled = false;
    loaderRef
      .current(repos)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, version, ...deps]);

  return { data, error };
}
