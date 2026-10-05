import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '../../db/ids';
import { cleanSteps } from '../../domain/flows';
import type { MainGroup, ProductGroup } from '../../domain/types';

import type { GroupRepository } from '../types';
import { notFound } from '../validation';

interface GroupRow {
  id: string;
  main: MainGroup;
  name: string;
  parent_id: string | null;
  steps: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

const toGroup = (r: GroupRow): ProductGroup => ({
  id: r.id,
  main: r.main,
  name: r.name,
  parentId: r.parent_id,
  steps: JSON.parse(r.steps) as string[],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

/** Produktgruppen mit Ablauf (Tabelle `product_groups`, Hauptgruppen per Migration angelegt). */
export class SqliteGroupRepository implements GroupRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async list(): Promise<ProductGroup[]> {
    const rows = await this.db.getAllAsync<GroupRow>('SELECT * FROM product_groups WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
    return rows.map(toGroup);
  }

  async create(input: { main: MainGroup; name: string; parentId: string; steps?: string[] }): Promise<ProductGroup> {
    const name = input.name.trim();
    if (!name) throw new Error('Bitte einen Namen für die Untergruppe angeben.');
    const dup = await this.db.getFirstAsync<GroupRow>(
      'SELECT * FROM product_groups WHERE deleted_at IS NULL AND parent_id = ? AND lower(name) = lower(?)',
      input.parentId,
      name,
    );
    if (dup) return toGroup(dup);
    const now = Date.now();
    const group: ProductGroup = {
      id: newId(), main: input.main, name, parentId: input.parentId, steps: cleanSteps(input.steps ?? []),
      createdAt: now, updatedAt: now, deletedAt: null,
    };
    await this.db.runAsync(
      'INSERT INTO product_groups (id, main, name, parent_id, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      group.id, group.main, group.name, group.parentId, JSON.stringify(group.steps), now, now,
    );
    return group;
  }

  async update(id: string, input: { name?: string; steps?: string[] }): Promise<void> {
    const row = await this.db.getFirstAsync<GroupRow>('SELECT * FROM product_groups WHERE id = ? AND deleted_at IS NULL', id);
    if (!row) throw notFound('Gruppe');
    const g = toGroup(row);
    const name = input.name?.trim() || g.name;
    const steps = input.steps !== undefined ? cleanSteps(input.steps) : g.steps;
    await this.db.runAsync('UPDATE product_groups SET name = ?, steps = ?, updated_at = ? WHERE id = ?', name, JSON.stringify(steps), Date.now(), id);
  }
}
