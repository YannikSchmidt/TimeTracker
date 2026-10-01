import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_SETTINGS, type Settings } from '../../domain/types';
import type { BackupData, Repositories, SettingsRepository } from '../types';
import { SqliteArticleRepository } from './articles';
import { SqliteDimensionRepository } from './dimensions';
import { SqliteEntryRepository } from './entries';

class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async get(): Promise<Settings> {
    const rows = await this.db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
    const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async set(input: Partial<Settings>): Promise<void> {
    for (const [key, value] of Object.entries(input)) {
      await this.db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        JSON.stringify(value),
      );
    }
  }
}

export function createSqliteRepositories(db: SQLiteDatabase): Repositories {
  const entries = new SqliteEntryRepository(db);
  const dimensions = new SqliteDimensionRepository(db);
  const articles = new SqliteArticleRepository(db);
  const settings = new SqliteSettingsRepository(db);

  return {
    entries,
    dimensions,
    articles,
    settings,

    async exportBackup(): Promise<BackupData> {
      return {
        version: 1,
        exportedAt: Date.now(),
        entries: await entries.listAll(),
        dimensions: await dimensions.listDimensions(),
        values: await dimensions.listValues(),
        articles: await articles.list(),
        settings: await settings.get(),
      };
    },

    async importBackup(data: BackupData): Promise<void> {
      if (data?.version !== 1 || !Array.isArray(data.entries)) {
        throw new Error('Unbekanntes Backup-Format.');
      }
      // Standard-Merkmale existieren auf jedem Gerät mit eigener ID → per key zuordnen.
      const localDims = await dimensions.listDimensions();
      const dimIdMap = new Map<string, string>();
      for (const d of data.dimensions) {
        const local = localDims.find((l) => l.key === d.key && !l.key.startsWith('custom_'));
        dimIdMap.set(d.id, local?.id ?? d.id);
      }
      // Artikelnummern sind eindeutig → gleiche Nummer mit anderer ID auf den lokalen Artikel abbilden.
      const articleIdMap = new Map<string, string>();
      for (const a of data.articles ?? []) {
        const local = await articles.findByNumber(a.number);
        articleIdMap.set(a.id, local && local.id !== a.id && !a.deletedAt ? local.id : a.id);
      }
      await db.withTransactionAsync(async () => {
        for (const d of data.dimensions) {
          const localId = dimIdMap.get(d.id)!;
          if (localId !== d.id) {
            await db.runAsync(
              'UPDATE dimensions SET name = ?, enabled = ?, updated_at = ? WHERE id = ?',
              d.name, d.enabled ? 1 : 0, Date.now(), localId,
            );
            continue;
          }
          await db.runAsync(
            `INSERT INTO dimensions (id, key, name, multi, enabled, sort, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET key = excluded.key, name = excluded.name, multi = excluded.multi,
               enabled = excluded.enabled, sort = excluded.sort, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
            d.id, d.key, d.name, d.multi ? 1 : 0, d.enabled ? 1 : 0, d.sort, d.createdAt, d.updatedAt, d.deletedAt,
          );
        }
        for (const v of data.values) {
          await db.runAsync(
            `INSERT INTO dimension_values (id, dimension_id, name, color, archived, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET dimension_id = excluded.dimension_id, name = excluded.name, color = excluded.color,
               archived = excluded.archived, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
            v.id, dimIdMap.get(v.dimensionId) ?? v.dimensionId, v.name, v.color, v.archived ? 1 : 0, v.createdAt, v.updatedAt, v.deletedAt,
          );
        }
        for (const a of data.articles ?? []) {
          if (articleIdMap.get(a.id) !== a.id) continue;
          await db.runAsync(
            `INSERT INTO articles (id, number, name, description, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET number = excluded.number, name = excluded.name, description = excluded.description,
               updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
            a.id, a.number, a.name, a.description, a.createdAt, a.updatedAt, a.deletedAt,
          );
        }
        for (const e of data.entries) {
          const articleId = e.articleId ? (articleIdMap.get(e.articleId) ?? e.articleId) : null;
          await db.runAsync(
            `INSERT INTO entries (id, start_at, end_at, note, article_id, order_no, quantity, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET start_at = excluded.start_at, end_at = excluded.end_at, note = excluded.note,
               article_id = excluded.article_id, order_no = excluded.order_no, quantity = excluded.quantity,
               updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
            e.id, e.startAt, e.endAt, e.note, articleId, e.orderNo ?? null, e.quantity ?? null, e.createdAt, e.updatedAt, e.deletedAt,
          );
          await db.runAsync('DELETE FROM entry_values WHERE entry_id = ?', e.id);
          for (const valueId of e.valueIds) {
            await db.runAsync('INSERT OR IGNORE INTO entry_values (entry_id, value_id) VALUES (?, ?)', e.id, valueId);
          }
        }
      });
      if (data.settings) await settings.set(data.settings);
    },
  };
}
