import { effectiveEnd } from './time';
import type { Article, Entry, Job, Millis, Segment } from './types';

/** Abschnitte gruppiert nach Auftrag (gelöschte ausgelassen). */
export function entriesByJob(entries: Entry[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    const list = map.get(e.jobId) ?? [];
    list.push(e);
    map.set(e.jobId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.startAt - b.startAt);
  return map;
}

/** Abschnitte mit den Feldern ihres Auftrags – Grundlage aller Statistiken. */
export function segmentsWithJob(entries: Entry[], jobs: Job[]): Segment[] {
  const byId = new Map(jobs.filter((j) => !j.deletedAt).map((j) => [j.id, j]));
  const out: Segment[] = [];
  for (const e of entries) {
    const job = byId.get(e.jobId);
    if (!job || e.deletedAt) continue;
    out.push({
      ...e,
      kind: job.kind,
      articleId: job.articleId,
      orderNo: job.orderNo,
      quantity: job.quantity,
      note: job.note,
      valueIds: job.valueIds,
      jobStartedAt: job.startedAt,
    });
  }
  return out;
}

export interface JobTimes {
  /** Arbeitszeit: Summe der Abschnitte (Timer lief) */
  workMs: Millis;
  /** Gesamtzeit: erster Start bis Abschluss (bzw. jetzt) */
  totalMs: Millis;
  /** Gesamtzeit minus Arbeitszeit */
  pausedMs: Millis;
  firstStart: Millis;
  /** Beginn des laufenden Abschnitts, sonst null */
  runningSince: Millis | null;
}

export function jobTimes(job: Job, entries: Entry[], now: Millis): JobTimes {
  const own = entries.filter((e) => e.jobId === job.id && !e.deletedAt);
  const workMs = own.reduce((sum, e) => sum + Math.max(0, effectiveEnd(e, now) - e.startAt), 0);
  const firstStart = own.length > 0 ? Math.min(...own.map((e) => e.startAt)) : job.startedAt;
  const lastEnd = job.finishedAt ?? (own.length > 0 ? Math.max(...own.map((e) => effectiveEnd(e, now))) : now);
  const end = job.status === 'done' ? lastEnd : now;
  const totalMs = Math.max(workMs, end - firstStart);
  const running = own.find((e) => e.endAt === null);
  return { workMs, totalMs, pausedMs: totalMs - workMs, firstStart, runningSince: running?.startAt ?? null };
}

export interface ReworkInfo {
  job: Job;
  workMs: Millis;
}

/** Nacharbeiten eines Auftrags mit ihrer Arbeitszeit. */
export function reworkOf(jobId: string, jobs: Job[], entries: Entry[], now: Millis): ReworkInfo[] {
  return jobs
    .filter((j) => j.kind === 'rework' && j.parentJobId === jobId && !j.deletedAt)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((job) => ({ job, workMs: jobTimes(job, entries, now).workMs }));
}

/** Kurztitel eines Auftrags ohne Artikel (z.B. für Texte, in denen der Artikel schon steht). */
export function jobTitle(job: Pick<Job, 'orderNo' | 'kind'>): string {
  if (job.kind === 'rework') return job.orderNo ? `Nacharbeit · Auftrag ${job.orderNo}` : 'Nacharbeit';
  return job.orderNo ? `Auftrag ${job.orderNo}` : 'Ohne Auftragsnummer';
}

/**
 * Name eines Timers: Auftragsnummer und Benennung des Artikels, z.B. „A-2026-0815 · Halter links“.
 * Ohne Benennung wird die Artikelnummer genommen; Nacharbeit bekommt „Nacharbeit · “ davor.
 */
export function jobName(
  job: Pick<Job, 'orderNo' | 'kind'>,
  article?: Pick<Article, 'number' | 'name'> | null,
): string {
  const articlePart = article ? article.name.trim() || article.number : '';
  const parts = [job.orderNo, articlePart].filter((s): s is string => !!s);
  if (job.kind === 'rework') return ['Nacharbeit', ...parts].join(' · ');
  return parts.length ? parts.join(' · ') : 'Ohne Auftragsnummer';
}
