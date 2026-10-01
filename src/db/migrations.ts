import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_DIMENSIONS, OBSOLETE_DIMENSION_KEYS } from '../domain/defaults';
import { newId } from './ids';

/**
 * Schema-Migrationen. Neue Migrationen nur hinten anhängen, niemals bestehende ändern.
 * Alle Tabellen haben UUIDs + created/updated/deleted_at, damit später ein
 * Server-Sync zwischen mehreren Geräten möglich ist.
 */
const MIGRATIONS: ((db: SQLiteDatabase) => Promise<void>)[] = [
  async (db) => {
    await db.execAsync(`
      CREATE TABLE entries (
        id TEXT PRIMARY KEY NOT NULL,
        start_at INTEGER NOT NULL,
        end_at INTEGER,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX idx_entries_start ON entries(start_at);
      CREATE INDEX idx_entries_running ON entries(end_at) WHERE end_at IS NULL;

      CREATE TABLE dimensions (
        id TEXT PRIMARY KEY NOT NULL,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        multi INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE TABLE dimension_values (
        id TEXT PRIMARY KEY NOT NULL,
        dimension_id TEXT NOT NULL REFERENCES dimensions(id),
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE TABLE entry_values (
        entry_id TEXT NOT NULL REFERENCES entries(id),
        value_id TEXT NOT NULL REFERENCES dimension_values(id),
        PRIMARY KEY (entry_id, value_id)
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

    const now = Date.now();
    for (const [i, { key, name, multi, enabled }] of DEFAULT_DIMENSIONS.entries()) {
      await db.runAsync(
        'INSERT INTO dimensions (id, key, name, multi, enabled, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        newId(),
        key,
        name,
        multi ? 1 : 0,
        enabled ? 1 : 0,
        i,
        now,
        now,
      );
    }
  },

  // v2: Artikel, Auftragsnummer und Stückzahl am Eintrag
  async (db) => {
    await db.execAsync(`
      CREATE TABLE articles (
        id TEXT PRIMARY KEY NOT NULL,
        number TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX idx_articles_number ON articles(number);

      ALTER TABLE entries ADD COLUMN article_id TEXT REFERENCES articles(id);
      ALTER TABLE entries ADD COLUMN order_no TEXT;
      ALTER TABLE entries ADD COLUMN quantity INTEGER;
      CREATE INDEX idx_entries_article ON entries(article_id);
    `);
    // Das vorbereitete Merkmal „Auftrag“ ist jetzt ein eigenes Feld – entfernen, solange unbenutzt.
    const now = Date.now();
    for (const key of OBSOLETE_DIMENSION_KEYS) {
      await db.runAsync(
        `UPDATE dimensions SET deleted_at = ?, updated_at = ?
         WHERE key = ? AND deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM dimension_values v WHERE v.dimension_id = dimensions.id AND v.deleted_at IS NULL)`,
        now,
        now,
        key,
      );
    }
  },
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const migration = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await migration(db);
    });
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
