import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '../../db/ids';
import type { Job, JobFields, Millis } from '../../domain/types';
import { jobFieldsWithDefaults, sortOpenJobs, type JobRepository, type JobStartInput } from '../types';
import { notFound, validateQuantity, validateTimes } from '../validation';

interface JobRow {
  id: string;
  kind: Job['kind'];
  status: Job['status'];
  article_id: string | null;
  order_no: string | null;
  quantity: number | null;
  note: string;
  parent_job_id: string | null;
  rework_reason: string | null;
  started_at: number;
  finished_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toJob(row: JobRow, valueIds: string[]): Job {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    articleId: row.article_id,
    orderNo: row.order_no,
    quantity: row.quantity,
    note: row.note,
    valueIds,
    reworkReason: row.rework_reason,
    parentJobId: row.parent_job_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    // Die native App speichert nur lokal (ohne Team-Sync)
    createdBy: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Aufträge in SQLite. Invariante: höchstens ein Abschnitt ohne Ende (= ein laufender Auftrag). */
export class SqliteJobRepository implements JobRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  private async withValues(rows: JobRow[]): Promise<Job[]> {
    if (rows.length === 0) return [];
    const links = await this.db.getAllAsync<{ job_id: string; value_id: string }>(
      'SELECT job_id, value_id FROM job_values WHERE job_id IN (SELECT value FROM json_each(?))',
      JSON.stringify(rows.map((r) => r.id)),
    );
    const byJob = new Map<string, string[]>();
    for (const l of links) byJob.set(l.job_id, [...(byJob.get(l.job_id) ?? []), l.value_id]);
    return rows.map((r) => toJob(r, byJob.get(r.id) ?? []));
  }

  async listOpen(): Promise<Job[]> {
    const rows = await this.db.getAllAsync<JobRow>(
      "SELECT * FROM jobs WHERE deleted_at IS NULL AND status != 'done'",
    );
    return sortOpenJobs(await this.withValues(rows));
  }

  async listAll(): Promise<Job[]> {
    const rows = await this.db.getAllAsync<JobRow>('SELECT * FROM jobs WHERE deleted_at IS NULL ORDER BY started_at DESC');
    return this.withValues(rows);
  }

  async get(id: string): Promise<Job | null> {
    const row = await this.db.getFirstAsync<JobRow>('SELECT * FROM jobs WHERE id = ?', id);
    if (!row) return null;
    return (await this.withValues([row]))[0];
  }

  private async require(id: string): Promise<Job> {
    const job = await this.get(id);
    if (!job || job.deletedAt) throw notFound();
    return job;
  }

  /** Offene Abschnitte schließen (alle oder nur eines Auftrags) und deren Aufträge pausieren. */
  private async closeOpen(now: Millis, jobId?: string): Promise<void> {
    const filter = jobId ? 'AND job_id = ?' : '';
    const params = jobId ? [jobId] : [];
    await this.db.runAsync(
      `UPDATE jobs SET status = 'paused', updated_at = ?
       WHERE status = 'running' AND id IN (SELECT job_id FROM entries WHERE end_at IS NULL AND deleted_at IS NULL ${filter})`,
      now,
      ...params,
    );
    await this.db.runAsync(
      `UPDATE entries SET end_at = MAX(?, start_at + 1), updated_at = ? WHERE end_at IS NULL AND deleted_at IS NULL ${filter}`,
      now,
      now,
      ...params,
    );
  }

  private async openEntry(jobId: string, now: Millis): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO entries (id, job_id, start_at, end_at, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)',
      newId(),
      jobId,
      now,
      now,
      now,
    );
  }

  private async setValues(jobId: string, valueIds: string[]): Promise<void> {
    await this.db.runAsync('DELETE FROM job_values WHERE job_id = ?', jobId);
    for (const v of new Set(valueIds)) {
      await this.db.runAsync('INSERT INTO job_values (job_id, value_id) VALUES (?, ?)', jobId, v);
    }
  }

  private async insertJob(input: JobStartInput, startedAt: Millis, status: Job['status'], finishedAt: Millis | null): Promise<Job> {
    const fields = jobFieldsWithDefaults(input);
    validateQuantity(fields.quantity);
    const now = Date.now();
    const job: Job = {
      id: newId(),
      kind: input.kind ?? 'order',
      status,
      parentJobId: input.parentJobId ?? null,
      ...fields,
      startedAt,
      finishedAt,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.db.runAsync(
      `INSERT INTO jobs (id, kind, status, article_id, order_no, quantity, note, parent_job_id, rework_reason,
                         started_at, finished_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      job.id,
      job.kind,
      job.status,
      job.articleId,
      job.orderNo,
      job.quantity,
      job.note,
      job.parentJobId,
      job.reworkReason,
      job.startedAt,
      job.finishedAt,
      now,
      now,
    );
    await this.setValues(job.id, job.valueIds);
    return job;
  }

  async start(input: JobStartInput): Promise<Job> {
    validateQuantity(input.quantity);
    const now = Date.now();
    let job!: Job;
    await this.db.withTransactionAsync(async () => {
      await this.closeOpen(now);
      job = await this.insertJob(input, now, 'running', null);
      await this.openEntry(job.id, now);
    });
    return job;
  }

  async pause(id: string): Promise<void> {
    const job = await this.require(id);
    if (job.status !== 'running') return;
    await this.db.withTransactionAsync(() => this.closeOpen(Date.now(), id));
  }

  async resume(id: string): Promise<void> {
    const job = await this.require(id);
    if (job.status === 'running') return;
    const now = Date.now();
    await this.db.withTransactionAsync(async () => {
      await this.closeOpen(now);
      await this.openEntry(id, now);
      await this.db.runAsync("UPDATE jobs SET status = 'running', finished_at = NULL, updated_at = ? WHERE id = ?", now, id);
    });
  }

  async finish(id: string, extra: { reworkReason?: string | null } = {}): Promise<void> {
    const job = await this.require(id);
    const now = Date.now();
    const reason = extra.reworkReason !== undefined ? extra.reworkReason?.trim() || null : job.reworkReason;
    await this.db.withTransactionAsync(async () => {
      await this.closeOpen(now, id);
      const last = await this.db.getFirstAsync<{ last: number | null }>(
        'SELECT MAX(end_at) AS last FROM entries WHERE job_id = ? AND deleted_at IS NULL',
        id,
      );
      await this.db.runAsync(
        "UPDATE jobs SET status = 'done', finished_at = COALESCE(finished_at, ?), rework_reason = ?, updated_at = ? WHERE id = ?",
        last?.last ?? now,
        reason,
        now,
        id,
      );
    });
  }

  async reopen(id: string): Promise<void> {
    const job = await this.require(id);
    if (job.status !== 'done') return;
    await this.db.runAsync("UPDATE jobs SET status = 'paused', finished_at = NULL, updated_at = ? WHERE id = ?", Date.now(), id);
  }

  async update(id: string, fields: Partial<JobFields>): Promise<void> {
    const job = await this.require(id);
    const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const next = jobFieldsWithDefaults({ ...job, ...defined });
    validateQuantity(next.quantity);
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE jobs SET article_id = ?, order_no = ?, quantity = ?, note = ?, rework_reason = ?, updated_at = ? WHERE id = ?`,
        next.articleId,
        next.orderNo,
        next.quantity,
        next.note,
        next.reworkReason,
        Date.now(),
        id,
      );
      if (fields.valueIds) await this.setValues(id, next.valueIds);
    });
  }

  async remove(id: string): Promise<void> {
    const now = Date.now();
    await this.db.withTransactionAsync(async () => {
      const ids = [id, ...(await this.db.getAllAsync<{ id: string }>('SELECT id FROM jobs WHERE parent_job_id = ?', id)).map((r) => r.id)];
      const list = JSON.stringify(ids);
      await this.db.runAsync(
        "UPDATE jobs SET deleted_at = ?, updated_at = ?, status = 'done' WHERE id IN (SELECT value FROM json_each(?))",
        now,
        now,
        list,
      );
      await this.db.runAsync(
        `UPDATE entries SET deleted_at = ?, updated_at = ?, end_at = COALESCE(end_at, ?)
         WHERE deleted_at IS NULL AND job_id IN (SELECT value FROM json_each(?))`,
        now,
        now,
        now,
        list,
      );
    });
  }

  async createManual(input: JobStartInput, startAt: Millis, endAt: Millis): Promise<Job> {
    validateTimes(startAt, endAt);
    let job!: Job;
    await this.db.withTransactionAsync(async () => {
      job = await this.insertJob(input, startAt, 'done', endAt);
      const now = Date.now();
      await this.db.runAsync(
        'INSERT INTO entries (id, job_id, start_at, end_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        newId(),
        job.id,
        startAt,
        endAt,
        now,
        now,
      );
    });
    return job;
  }
}
