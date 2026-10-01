import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '../../db/ids';
import type { Entry, Millis } from '../../domain/types';
import type { EntryInput, EntryRepository } from '../types';
import { validateEntry } from '../validation';

interface EntryRow {
  id: string;
  start_at: number;
  end_at: number | null;
  note: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toEntry(row: EntryRow, valueIds: string[]): Entry {
  return {
    id: row.id,
    startAt: row.start_at,
    endAt: row.end_at,
    note: row.note,
    valueIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export class SqliteEntryRepository implements EntryRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  private async withValues(rows: EntryRow[]): Promise<Entry[]> {
    if (rows.length === 0) return [];
    const links = await this.db.getAllAsync<{ entry_id: string; value_id: string }>(
      'SELECT entry_id, value_id FROM entry_values WHERE entry_id IN (SELECT value FROM json_each(?))',
      JSON.stringify(rows.map((r) => r.id)),
    );
    const byEntry = new Map<string, string[]>();
    for (const link of links) {
      const list = byEntry.get(link.entry_id) ?? [];
      list.push(link.value_id);
      byEntry.set(link.entry_id, list);
    }
    return rows.map((row) => toEntry(row, byEntry.get(row.id) ?? []));
  }

  async listInRange(start: Millis, end: Millis): Promise<Entry[]> {
    const rows = await this.db.getAllAsync<EntryRow>(
      `SELECT * FROM entries
       WHERE deleted_at IS NULL AND start_at < ? AND (end_at IS NULL OR end_at > ?)
       ORDER BY start_at DESC`,
      end,
      start,
    );
    return this.withValues(rows);
  }

  async listAll(): Promise<Entry[]> {
    const rows = await this.db.getAllAsync<EntryRow>(
      'SELECT * FROM entries WHERE deleted_at IS NULL ORDER BY start_at DESC',
    );
    return this.withValues(rows);
  }

  async get(id: string): Promise<Entry | null> {
    const row = await this.db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE id = ?', id);
    if (!row) return null;
    const [entry] = await this.withValues([row]);
    return entry;
  }

  async getRunning(): Promise<Entry | null> {
    const row = await this.db.getFirstAsync<EntryRow>(
      'SELECT * FROM entries WHERE deleted_at IS NULL AND end_at IS NULL ORDER BY start_at DESC LIMIT 1',
    );
    if (!row) return null;
    const [entry] = await this.withValues([row]);
    return entry;
  }

  async start(input: Partial<Pick<EntryInput, 'note' | 'valueIds'>> = {}): Promise<Entry> {
    const now = Date.now();
    let created!: Entry;
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE entries SET end_at = ?, updated_at = ? WHERE end_at IS NULL AND deleted_at IS NULL',
        now,
        now,
      );
      created = await this.insert({ startAt: now, endAt: null, note: input.note ?? '', valueIds: input.valueIds ?? [] });
    });
    return created;
  }

  async stop(id: string, at: Millis = Date.now()): Promise<void> {
    await this.db.runAsync('UPDATE entries SET end_at = ?, updated_at = ? WHERE id = ? AND end_at IS NULL', at, Date.now(), id);
  }

  async create(input: EntryInput): Promise<Entry> {
    validateEntry(input);
    let created!: Entry;
    await this.db.withTransactionAsync(async () => {
      created = await this.insert(input);
    });
    return created;
  }

  private async insert(input: EntryInput): Promise<Entry> {
    const now = Date.now();
    const id = newId();
    await this.db.runAsync(
      'INSERT INTO entries (id, start_at, end_at, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      input.startAt,
      input.endAt,
      input.note,
      now,
      now,
    );
    await this.setValues(id, input.valueIds);
    return { id, ...input, createdAt: now, updatedAt: now, deletedAt: null };
  }

  private async setValues(entryId: string, valueIds: string[]): Promise<void> {
    await this.db.runAsync('DELETE FROM entry_values WHERE entry_id = ?', entryId);
    for (const valueId of new Set(valueIds)) {
      await this.db.runAsync('INSERT INTO entry_values (entry_id, value_id) VALUES (?, ?)', entryId, valueId);
    }
  }

  async update(id: string, input: Partial<EntryInput>): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error('Eintrag nicht gefunden.');
    const next = { ...current, ...input };
    validateEntry(next);
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE entries SET start_at = ?, end_at = ?, note = ?, updated_at = ? WHERE id = ?',
        next.startAt,
        next.endAt,
        next.note,
        Date.now(),
        id,
      );
      if (input.valueIds) await this.setValues(id, input.valueIds);
    });
  }

  async remove(id: string): Promise<void> {
    const now = Date.now();
    await this.db.runAsync('UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
  }
}
