import type { SQLiteDatabase } from 'expo-sqlite';

import type { Entry, Millis } from '../../domain/types';
import type { EntryRepository } from '../types';
import { notFound, validateTimes } from '../validation';

export interface EntryRow {
  id: string;
  job_id: string;
  start_at: number;
  end_at: number | null;
  step: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export const ENTRY_COLUMNS = 'id, job_id, start_at, end_at, step, created_at, updated_at, deleted_at';

export function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    jobId: row.job_id,
    startAt: row.start_at,
    endAt: row.end_at,
    step: row.step ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Arbeitsabschnitte in SQLite (Tabelle `entries`). */
export class SqliteEntryRepository implements EntryRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async listInRange(start: Millis, end: Millis): Promise<Entry[]> {
    const rows = await this.db.getAllAsync<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries
       WHERE deleted_at IS NULL AND job_id IS NOT NULL AND start_at < ? AND (end_at IS NULL OR end_at > ?)
       ORDER BY start_at DESC`,
      end,
      start,
    );
    return rows.map(toEntry);
  }

  async listAll(): Promise<Entry[]> {
    const rows = await this.db.getAllAsync<EntryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM entries WHERE deleted_at IS NULL AND job_id IS NOT NULL ORDER BY start_at DESC`,
    );
    return rows.map(toEntry);
  }

  async get(id: string): Promise<Entry | null> {
    const row = await this.db.getFirstAsync<EntryRow>(`SELECT ${ENTRY_COLUMNS} FROM entries WHERE id = ?`, id);
    return row ? toEntry(row) : null;
  }

  async update(id: string, input: { startAt?: Millis; endAt?: Millis | null }): Promise<void> {
    const current = await this.get(id);
    if (!current || current.deletedAt) throw notFound('Abschnitt');
    const startAt = input.startAt ?? current.startAt;
    const endAt = input.endAt === undefined ? current.endAt : input.endAt;
    validateTimes(startAt, endAt);
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE entries SET start_at = ?, end_at = ?, updated_at = ? WHERE id = ?', startAt, endAt, Date.now(), id);
      await syncJobBounds(this.db, current.jobId);
    });
  }

  async remove(id: string): Promise<void> {
    const current = await this.get(id);
    if (!current || current.deletedAt) return;
    const now = Date.now();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
      if (current.endAt === null) {
        await this.db.runAsync(
          "UPDATE jobs SET status = 'paused', updated_at = ? WHERE id = ? AND status = 'running'",
          now,
          current.jobId,
        );
      }
      await syncJobBounds(this.db, current.jobId);
    });
  }
}

/** Startzeit (und bei abgeschlossenen Aufträgen das Ende) an die Abschnitte anpassen. */
export async function syncJobBounds(db: SQLiteDatabase, jobId: string): Promise<void> {
  const b = await db.getFirstAsync<{ first: number | null; last: number | null }>(
    `SELECT MIN(start_at) AS first, MAX(COALESCE(end_at, ?)) AS last
     FROM entries WHERE job_id = ? AND deleted_at IS NULL`,
    Date.now(),
    jobId,
  );
  if (b?.first == null) return;
  await db.runAsync(
    `UPDATE jobs SET started_at = ?, finished_at = CASE WHEN status = 'done' THEN ? ELSE finished_at END WHERE id = ?`,
    b.first,
    b.last,
    jobId,
  );
}
