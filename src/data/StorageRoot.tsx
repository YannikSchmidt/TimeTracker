import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useMemo, type ReactNode } from 'react';

import { migrate } from '../db/migrations';
import { createSqliteRepositories } from '../repositories/sqlite';
import { DataProvider } from './DataProvider';

/** Native App: Daten in einer lokalen SQLite-Datenbank. */
export function StorageRoot({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName="timetracker.db" onInit={migrate}>
      <SqliteData>{children}</SqliteData>
    </SQLiteProvider>
  );
}

function SqliteData({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const repos = useMemo(() => createSqliteRepositories(db), [db]);
  return <DataProvider repos={repos}>{children}</DataProvider>;
}
