import type { SQLiteDatabase } from 'expo-sqlite';

import { upgradeBackup } from '../../domain/legacy';
import { DEFAULT_SETTINGS, type Settings } from '../../domain/types';
import type { BackupData, Repositories, SettingsRepository } from '../types';
import { SqliteArticleRepository } from './articles';
import { SqliteDimensionRepository } from './dimensions';
import { SqliteEntryRepository } from './entries';
import { SqliteGroupRepository } from './groups';
import { SqliteJobRepository } from './jobs';

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
  const jobs = new SqliteJobRepository(db);
  const entries = new SqliteEntryRepository(db);
  const dimensions = new SqliteDimensionRepository(db);
  const articles = new SqliteArticleRepository(db);
  const settings = new SqliteSettingsRepository(db);
  const groups = new SqliteGroupRepository(db);

  return {
    jobs,
    // Löschvorschläge gibt es nur mit Team-Sync (Web-App); in der nativen App wird direkt gelöscht.
    requests: {
      async list() {
        return [];
      },
      async create() {
        throw new Error('Löschvorschläge gibt es nur mit Team-Sync.');
      },
      async setStatus() {},
    },
    groups,
    entries,
    dimensions,
    articles,
    settings,

    async exportBackup(): Promise<BackupData> {
      return {
        version: 2,
        exportedAt: Date.now(),
        jobs: await jobs.listAll(),
        entries: await entries.listAll(),
        dimensions: await dimensions.listDimensions(),
        values: await dimensions.listValues(),
        articles: await articles.list(),
        groups: await groups.list(),
        settings: await settings.get(),
      };
    },

    async importBackup(raw): Promise<void> {
      const data = upgradeBackup(raw);
      // Standard-Merkmale existieren auf jedem Gerät mit eigener ID → per key zuordnen.
      const localDims = await dimensions.listDimensions();
      const dimIdMap = new Map<string, string>();
      for (const d of data.dimensions) {
        const local = localDims.find((l) => l.key === d.key && !l.key.startsWith('custom_'));
        dimIdMap.set(d.id, local?.id ?? d.id);
      }
      // Artikelnummern sind eindeutig → gleiche Nummer mit anderer ID auf den lokalen Artikel abbilden.
      const articleIdMap = new Map<string, string>();
      for (const a of data.articles) {
        const local = await articles.findByNumber(a.number);
        articleIdMap.set(a.id, local && local.id !== a.id && !a.deletedAt ? local.id : a.id);
      }
      // Nur ein Auftrag darf laufen: läuft lokal schon einer, werden importierte pausiert.
      const localRunning = (await jobs.listOpen()).some((j) => j.status === 'running');
      const now = Date.now();

      await db.withTransactionAsync(async () => {
        for (const d of data.dimensions) {
          const localId = dimIdMap.get(d.id)!;
          if (localId !== d.id) {
            await db.runAsync(
              'UPDATE dimensions SET name = ?, enabled = ?, updated_at = ? WHERE id = ?',
              d.name, d.enabled ? 1 : 0, now, localId,
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
        for (const a of data.articles) {
          if (articleIdMap.get(a.id) !== a.id) continue;
          await db.runAsync(
            `INSERT INTO articles (id, number, name, device, group_id, targets, no_sections, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET number = excluded.number, name = excluded.name, device = excluded.device,
               group_id = excluded.group_id, targets = excluded.targets, no_sections = excluded.no_sections,
               updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
            a.id, a.number, a.name, a.device, a.groupId, JSON.stringify(a.targets ?? {}), a.noSections ? 1 : 0, a.createdAt, a.updatedAt, a.deletedAt,
          );
        }
        for (const j of data.jobs) {
          const articleId = j.articleId ? (articleIdMap.get(j.articleId) ?? j.articleId) : null;
          const status = localRunning && j.status === 'running' ? 'paused' : j.status;
          await db.runAsync(
            `INSERT INTO jobs (id, kind, status, article_id, order_no, quantity, note, parent_job_id, rework_reason,
                               started_at, finished_at, current_step, only_step, workers, section, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, status = excluded.status, article_id = excluded.article_id,
               order_no = excluded.order_no, quantity = excluded.quantity, note = excluded.note,
               parent_job_id = excluded.parent_job_id, rework_reason = excluded.rework_reason,
               started_at = excluded.started_at, finished_at = excluded.finished_at,
               current_step = excluded.current_step, only_step = excluded.only_step, workers = excluded.workers,
               section = excluded.section,
               updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
            j.id, j.kind, status, articleId, j.orderNo, j.quantity, j.note ?? '', j.parentJobId, j.reworkReason,
            j.startedAt, j.finishedAt, j.currentStep, j.onlyStep, j.workers ?? 1, j.section ?? null, j.createdAt, j.updatedAt, j.deletedAt,
          );
          await db.runAsync('DELETE FROM job_values WHERE job_id = ?', j.id);
          for (const valueId of j.valueIds ?? []) {
            await db.runAsync('INSERT OR IGNORE INTO job_values (job_id, value_id) VALUES (?, ?)', j.id, valueId);
          }
        }
        for (const g of data.groups ?? []) {
          await db.runAsync(
            `INSERT INTO product_groups (id, main, name, parent_id, steps, display_steps, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, steps = excluded.steps, display_steps = excluded.display_steps,
               updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
             WHERE excluded.updated_at >= product_groups.updated_at`,
            g.id, g.main, g.name, g.parentId, JSON.stringify(g.steps), JSON.stringify(g.displaySteps ?? []), g.createdAt, g.updatedAt, g.deletedAt,
          );
        }
        for (const e of data.entries) {
          const endAt = localRunning && e.endAt === null ? Math.max(now, e.startAt + 1) : e.endAt;
          await db.runAsync(
            `INSERT INTO entries (id, job_id, start_at, end_at, step, workers, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET job_id = excluded.job_id, start_at = excluded.start_at, end_at = excluded.end_at,
               step = excluded.step, workers = excluded.workers, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
            e.id, e.jobId, e.startAt, endAt, e.step, e.workers ?? 1, e.createdAt, e.updatedAt, e.deletedAt,
          );
        }
      });
      if (data.settings) await settings.set(data.settings);
    },
  };
}
