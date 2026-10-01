import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '../../db/ids';
import type { Dimension, DimensionValue } from '../../domain/types';
import type { DimensionRepository } from '../types';

interface DimensionRow {
  id: string;
  key: string;
  name: string;
  multi: number;
  enabled: number;
  sort: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface ValueRow {
  id: string;
  dimension_id: string;
  name: string;
  color: string;
  archived: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

const toDimension = (r: DimensionRow): Dimension => ({
  id: r.id,
  key: r.key,
  name: r.name,
  multi: r.multi === 1,
  enabled: r.enabled === 1,
  sort: r.sort,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

const toValue = (r: ValueRow): DimensionValue => ({
  id: r.id,
  dimensionId: r.dimension_id,
  name: r.name,
  color: r.color,
  archived: r.archived === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

/** Baut ein UPDATE nur für die übergebenen Felder. */
function buildUpdate(columns: Record<string, string | number | null | undefined>) {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  for (const [column, value] of Object.entries(columns)) {
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(value);
  }
  sets.push('updated_at = ?');
  params.push(Date.now());
  return { sql: sets.join(', '), params };
}

const bool = (v: boolean | undefined) => (v === undefined ? undefined : v ? 1 : 0);

export class SqliteDimensionRepository implements DimensionRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async listDimensions(): Promise<Dimension[]> {
    const rows = await this.db.getAllAsync<DimensionRow>(
      'SELECT * FROM dimensions WHERE deleted_at IS NULL ORDER BY sort, created_at',
    );
    return rows.map(toDimension);
  }

  async listValues(): Promise<DimensionValue[]> {
    const rows = await this.db.getAllAsync<ValueRow>(
      'SELECT * FROM dimension_values WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE',
    );
    return rows.map(toValue);
  }

  async createDimension(input: { name: string; multi: boolean }): Promise<Dimension> {
    const now = Date.now();
    const id = newId();
    const max = await this.db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort) AS m FROM dimensions');
    const sort = (max?.m ?? -1) + 1;
    await this.db.runAsync(
      'INSERT INTO dimensions (id, key, name, multi, enabled, sort, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
      id,
      `custom_${id}`,
      input.name,
      input.multi ? 1 : 0,
      sort,
      now,
      now,
    );
    return { id, key: `custom_${id}`, name: input.name, multi: input.multi, enabled: true, sort, createdAt: now, updatedAt: now, deletedAt: null };
  }

  async updateDimension(id: string, input: Partial<Pick<Dimension, 'name' | 'enabled' | 'multi'>>): Promise<void> {
    const { sql, params } = buildUpdate({ name: input.name, enabled: bool(input.enabled), multi: bool(input.multi) });
    await this.db.runAsync(`UPDATE dimensions SET ${sql} WHERE id = ?`, ...params, id);
  }

  async createValue(input: { dimensionId: string; name: string; color: string }): Promise<DimensionValue> {
    const now = Date.now();
    const id = newId();
    await this.db.runAsync(
      'INSERT INTO dimension_values (id, dimension_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      input.dimensionId,
      input.name,
      input.color,
      now,
      now,
    );
    return { id, ...input, archived: false, createdAt: now, updatedAt: now, deletedAt: null };
  }

  async updateValue(id: string, input: Partial<Pick<DimensionValue, 'name' | 'color' | 'archived'>>): Promise<void> {
    const { sql, params } = buildUpdate({ name: input.name, color: input.color, archived: bool(input.archived) });
    await this.db.runAsync(`UPDATE dimension_values SET ${sql} WHERE id = ?`, ...params, id);
  }
}
