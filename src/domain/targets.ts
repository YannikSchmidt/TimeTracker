import { timeByStep } from './flows';
import type { Article, Entry, Job, Millis } from './types';

/** Vorgabe eines Arbeitsschritts in Minuten: Rüstzeit (einmal pro Auftrag) + Einzelzeit (pro Stück). */
export interface StepTarget {
  setup: number;
  perPiece: number;
}

/** Schlüssel für Artikel ohne Ablauf: Vorgabe für den ganzen Auftrag */
export const WHOLE_ORDER = '';

const MIN = 60_000;

/** Schritte, für die eine Vorgabe gilt: nur der eine Schritt, sonst der Ablauf, ohne Ablauf der ganze Auftrag. */
export function targetSteps(steps: string[], onlyStep: string | null = null): string[] {
  return onlyStep ? [onlyStep] : steps.length ? steps : [WHOLE_ORDER];
}

/** Vorgabezeit eines Schritts für eine Stückzahl (ms); null, wenn nichts hinterlegt ist. */
export function stepTargetMs(article: Article | null | undefined, step: string, quantity: number | null): Millis | null {
  const t = article?.targets?.[step];
  if (!t || (!t.setup && !t.perPiece)) return null;
  return Math.round((t.setup + t.perPiece * (quantity ?? 1)) * MIN);
}

export interface Comparison {
  /** tatsächliche Zeit (Timer lief) */
  actualMs: Millis;
  /** Summe der Vorgaben; null = keine Vorgabe hinterlegt */
  targetMs: Millis | null;
  /** Abweichung in Prozent der Vorgabe (+ = länger gebraucht) */
  deltaPct: number | null;
  byStep: { step: string; actualMs: Millis; targetMs: Millis | null }[];
}

export function deltaPct(actualMs: Millis, targetMs: Millis | null): number | null {
  return targetMs ? Math.round(((actualMs - targetMs) / targetMs) * 100) : null;
}

/**
 * Vorgabe gegen Ist für einen Auftrag. Gezählt wird nur die Zeit, in der der Timer lief.
 * Mit Arbeitsschritten wird pro Schritt verglichen, ohne Ablauf der ganze Auftrag.
 */
export function compareJob(job: Job, entries: Entry[], article: Article | null | undefined, steps: string[], now: Millis): Comparison {
  const relevant = targetSteps(steps, job.onlyStep);
  const live = entries.filter((e) => !e.deletedAt);
  const total = live.reduce((s, e) => s + ((e.endAt ?? now) - e.startAt), 0);
  const actualByStep = new Map(timeByStep(live, steps, now).map((s) => [s.step, s.ms]));
  const byStep = relevant.map((step) => ({
    step,
    actualMs: step === WHOLE_ORDER ? total : (actualByStep.get(step) ?? 0),
    targetMs: stepTargetMs(article, step, job.quantity),
  }));
  const withTarget = byStep.filter((s) => s.targetMs !== null);
  const targetMs = withTarget.length ? withTarget.reduce((s, x) => s + x.targetMs!, 0) : null;
  return { actualMs: total, targetMs, deltaPct: deltaPct(total, targetMs), byStep };
}

/** „+12 %“ / „−5 %“ */
export function formatPct(pct: number | null): string {
  if (pct === null) return '–';
  return `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)} %`;
}

/** Minuten-Eingabe lesen („1,5“ → 1.5); leer/ungültig → 0 */
export function parseMinutes(text: string): number {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export function formatMinutes(n: number | undefined): string {
  return n ? String(n).replace('.', ',') : '';
}

/** Leere Vorgaben entfernen, Werte auf ≥ 0 begrenzen */
export function cleanTargets(targets: Record<string, StepTarget>): Record<string, StepTarget> {
  const out: Record<string, StepTarget> = {};
  for (const [step, t] of Object.entries(targets)) {
    const setup = Math.max(0, Number(t?.setup) || 0);
    const perPiece = Math.max(0, Number(t?.perPiece) || 0);
    if (setup || perPiece) out[step] = { setup, perPiece };
  }
  return out;
}

export interface ComparisonRow {
  key: string;
  jobs: number;
  pieces: number;
  /** Ist-Zeit aller Aufträge */
  actualMs: Millis;
  /** Summe der Vorgaben (nur Aufträge mit Vorgabe) */
  targetMs: Millis;
  /** Ist-Zeit der Aufträge mit Vorgabe – Grundlage für die Abweichung */
  comparableMs: Millis;
  /** Aufträge mit Vorgabe */
  jobsWithTarget: number;
  deltaPct: number | null;
}

/** Abgeschlossene Aufträge nach Schlüssel (Artikel, Untergruppe, …) zusammenfassen: Ist gegen Vorgabe. */
export function compareJobs(
  items: { job: Job; comparison: Comparison }[],
  keyOf: (job: Job) => string,
): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();
  for (const { job, comparison } of items) {
    const key = keyOf(job);
    const r = rows.get(key) ?? { key, jobs: 0, pieces: 0, actualMs: 0, targetMs: 0, comparableMs: 0, jobsWithTarget: 0, deltaPct: null };
    r.jobs++;
    r.pieces += job.quantity ?? 0;
    r.actualMs += comparison.actualMs;
    if (comparison.targetMs !== null) {
      r.targetMs += comparison.targetMs;
      r.comparableMs += comparison.actualMs;
      r.jobsWithTarget++;
    }
    rows.set(key, r);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, deltaPct: r.jobsWithTarget ? deltaPct(r.comparableMs, r.targetMs) : null }))
    .sort((a, b) => b.actualMs - a.actualMs);
}
