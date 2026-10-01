import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '../../db/ids';
import type { Article } from '../../domain/types';
import type { ArticleInput, ArticleRepository } from '../types';
import { duplicateArticleError, normalizeArticleNumber } from '../validation';

interface ArticleRow {
  id: string;
  number: string;
  name: string;
  device: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

const toArticle = (r: ArticleRow): Article => ({
  id: r.id,
  number: r.number,
  name: r.name,
  device: r.device,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
});

export class SqliteArticleRepository implements ArticleRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async list(): Promise<Article[]> {
    const rows = await this.db.getAllAsync<ArticleRow>(
      'SELECT * FROM articles WHERE deleted_at IS NULL ORDER BY number COLLATE NOCASE',
    );
    return rows.map(toArticle);
  }

  async get(id: string): Promise<Article | null> {
    const row = await this.db.getFirstAsync<ArticleRow>('SELECT * FROM articles WHERE id = ?', id);
    return row ? toArticle(row) : null;
  }

  async findByNumber(number: string): Promise<Article | null> {
    const row = await this.db.getFirstAsync<ArticleRow>(
      'SELECT * FROM articles WHERE number = ? AND deleted_at IS NULL',
      number.trim(),
    );
    return row ? toArticle(row) : null;
  }

  async create(input: ArticleInput): Promise<Article> {
    const number = normalizeArticleNumber(input.number);
    if (await this.findByNumber(number)) throw duplicateArticleError(number);
    const now = Date.now();
    const article: Article = {
      id: newId(),
      number,
      name: input.name.trim(),
      device: input.device.trim(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.db.runAsync(
      'INSERT INTO articles (id, number, name, device, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      article.id,
      article.number,
      article.name,
      article.device,
      now,
      now,
    );
    return article;
  }

  async update(id: string, input: Partial<ArticleInput>): Promise<void> {
    const current = await this.get(id);
    if (!current) throw new Error('Artikel nicht gefunden.');
    const number = input.number === undefined ? current.number : normalizeArticleNumber(input.number);
    const other = await this.findByNumber(number);
    if (other && other.id !== id) throw duplicateArticleError(number);
    await this.db.runAsync(
      'UPDATE articles SET number = ?, name = ?, device = ?, updated_at = ? WHERE id = ?',
      number,
      (input.name ?? current.name).trim(),
      (input.device ?? current.device).trim(),
      Date.now(),
      id,
    );
  }

  async remove(id: string): Promise<void> {
    const now = Date.now();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE articles SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
      await this.db.runAsync('UPDATE jobs SET article_id = NULL, updated_at = ? WHERE article_id = ?', now, id);
    });
  }
}
