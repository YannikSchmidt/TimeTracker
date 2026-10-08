import { entryMs, timeByStep } from './flows';
import { formatDuration } from './time';
import type { Article, Entry, Job, Millis, Section } from './types';

/** Vorgabe eines Arbeitsschritts in Minuten: Rüstzeit (einmal pro Auftrag) + Einzelzeit (pro Stück). */
export interface StepTarget {
  setup: number;
  perPiece: number;
}

/** Schlüssel für Artikel ohne Ablauf: Vorgabe für den ganzen Auftrag */
export const WHOLE_ORDER = '';

/** Vorgabezeiten der Display-Verheiratung stehen mit diesem Präfix am Artikel (Gesamtmontage ohne Präfix). */
export const DISPLAY_PREFIX = 'display:';

/** Schlüssel einer Vorgabezeit am Artikel für Teil und Schritt */
export function targetKey(section: Section | null | undefined, step: string): string {
  return section === 'display' ? DISPLAY_PREFIX + step : step;
}

/** Ausgeblendete Schritte eines Artikels für einen Teil (ohne Präfix) */
export function hiddenStepsFor(article: Article | null | undefined, section: Section | null | undefined): string[] {
  const all = article?.hiddenSteps ?? [];
  return section === 'display'
    ? all.filter((k) => k.startsWith(DISPLAY_PREFIX)).map((k) => k.slice(DISPLAY_PREFIX.length))
    : all.filter((k) => !k.startsWith(DISPLAY_PREFIX));
}

/** Artikel mit den Vorgabezeiten nur dieses Teils (Schlüssel = Schrittname) – für alle Vergleiche */
export function articleForSection<A extends Article | null | undefined>(article: A, section: Section | null | undefined): A {
  if (!article) return article;
  const all = Object.entries(article.targets ?? {});
  const targets =
    section === 'display'
      ? Object.fromEntries(all.filter(([k]) => k.startsWith(DISPLAY_PREFIX)).map(([k, v]) => [k.slice(DISPLAY_PREFIX.length), v]))
      : Object.fromEntries(all.filter(([k]) => !k.startsWith(DISPLAY_PREFIX)));
  return { ...article, targets };
}

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
  /** tatsächliche Zeit als Personenzeit (Timer lief × Personenzähler, über alle beteiligten Timer) */
  actualMs: Millis;
  /** Summe der Vorgaben; null = keine Vorgabe hinterlegt */
  targetMs: Millis | null;
  /** Abweichung in Prozent der Vorgabe (+ = länger gebraucht) */
  deltaPct: number | null;
  byStep: { step: string; actualMs: Millis; targetMs: Millis | null }[];
  /** nur bei compareShare: eigener Anteil an der Arbeitszeit aller Beteiligten (0–1) */
  share?: number;
  /** nur bei compareShare: Vorgabe des ganzen Auftrags (alle zusammen) */
  orderTargetMs?: Millis | null;
}

export function deltaPct(actualMs: Millis, targetMs: Millis | null): number | null {
  return targetMs ? Math.round(((actualMs - targetMs) / targetMs) * 100) : null;
}

/**
 * Vorgabe gegen Ist für einen Auftrag. Gezählt wird die Zeit, in der der Timer lief, mal Personenzähler.
 * Mit Arbeitsschritten wird pro Schritt verglichen, ohne Ablauf der ganze Auftrag.
 */
export function compareJob(job: Job, entries: Entry[], article: Article | null | undefined, steps: string[], now: Millis): Comparison {
  return compareOrder([{ job, entries }], article, steps, now);
}

/**
 * Vergleich über mehrere Timer am selben Auftrag (z.B. zwei Personen, jede mit eigenem Timer):
 * Personenzeiten werden addiert, die Vorgabe gilt einmal für den Auftrag (größte angegebene Stückzahl).
 */
export function compareOrder(parts: { job: Job; entries: Entry[] }[], article: Article | null | undefined, steps: string[], now: Millis): Comparison {
  // Einzelschritt-Timer: verglichen werden die Schritte, die tatsächlich getrackt wurden (auch nach Schrittwechsel)
  const onlySteps = parts.every((p) => p.job.onlyStep)
    ? new Set(
        parts.flatMap((p) => [p.job.onlyStep!, ...p.entries.filter((e) => !e.deletedAt && e.step).map((e) => e.step!)]),
      )
    : null;
  const relevant = onlySteps
    ? [...steps.filter((s) => onlySteps.has(s)), ...[...onlySteps].filter((s) => !steps.includes(s))]
    : targetSteps(steps);
  const quantities = parts.map((p) => p.job.quantity).filter((q): q is number => q !== null);
  const quantity = quantities.length ? Math.max(...quantities) : null;
  const live = parts.flatMap((p) => p.entries).filter((e) => !e.deletedAt);
  const total = live.reduce((s, e) => s + entryMs(e, now, true), 0);
  const actualByStep = new Map(timeByStep(live, steps, now, true).map((s) => [s.step, s.ms]));
  const byStep = relevant.map((step) => ({
    step,
    actualMs: step === WHOLE_ORDER ? total : (actualByStep.get(step) ?? 0),
    targetMs: stepTargetMs(article, step, quantity),
  }));
  const withTarget = byStep.filter((s) => s.targetMs !== null);
  const targetMs = withTarget.length ? withTarget.reduce((s, x) => s + x.targetMs!, 0) : null;
  return { actualMs: total, targetMs, deltaPct: deltaPct(total, targetMs), byStep };
}

/**
 * Eigener Anteil an einem gemeinsamen Auftrag: Die Vorgabe wird im Verhältnis der geleisteten Personenzeit
 * aufgeteilt (je Schritt). Beispiel: 15 h Vorgabe, A arbeitet 8 h, B 2 h → A bekommt 12 h, B 3 h gutgeschrieben.
 * Damit hat jede beteiligte Person dieselbe prozentuale Abweichung wie der Auftrag insgesamt.
 * `own` = IDs der eigenen Timer; ohne weitere Beteiligte entspricht das Ergebnis compareOrder.
 */
export function compareShare(
  parts: { job: Job; entries: Entry[] }[],
  own: Set<string>,
  article: Article | null | undefined,
  steps: string[],
  now: Millis,
): Comparison {
  const whole = compareOrder(parts, article, steps, now);
  const mine = parts.filter((p) => own.has(p.job.id)).flatMap((p) => p.entries).filter((e) => !e.deletedAt);
  const myTotal = mine.reduce((s, e) => s + entryMs(e, now, true), 0);
  const myByStep = new Map(timeByStep(mine, steps, now, true).map((s) => [s.step, s.ms]));
  // Anteil an Schritten, an denen noch niemand gearbeitet hat: wie bei der Zeit insgesamt (allein = 100 %)
  const ownParts = parts.filter((p) => own.has(p.job.id)).length;
  const overall = whole.actualMs > 0 ? myTotal / whole.actualMs : parts.length ? ownParts / parts.length : 0;
  const byStep = whole.byStep.map((s) => {
    const actualMs = s.step === WHOLE_ORDER ? myTotal : (myByStep.get(s.step) ?? 0);
    const share = s.actualMs > 0 ? actualMs / s.actualMs : overall;
    return { step: s.step, actualMs, targetMs: s.targetMs === null ? null : Math.round(s.targetMs * share) };
  });
  const withTarget = byStep.filter((s) => s.targetMs !== null);
  const targetMs = whole.targetMs === null ? null : withTarget.reduce((s, x) => s + x.targetMs!, 0);
  return { actualMs: myTotal, targetMs, deltaPct: deltaPct(myTotal, targetMs), byStep, share: overall, orderTargetMs: whole.targetMs };
}

/**
 * Grober, nur positiver Team-Vergleich (Datenschutz): Wer am weitesten unter der Vorgabe liegt bzw. zur
 * schnelleren Hälfte gehört, bekommt ein Lob. Alle anderen bekommen nichts angezeigt – niemand wird als langsam
 * markiert, und keine fremden Zeiten werden genannt.
 */
export function teamPraise(me: string, people: { id: string; actualMs: Millis; targetMs: Millis }[]): string | null {
  const ratios = people.filter((p) => p.targetMs > 0).map((p) => ({ id: p.id, ratio: p.actualMs / p.targetMs }));
  const mine = ratios.find((r) => r.id === me);
  if (!mine || ratios.length < 2) return null;
  // Gleichstand (z.B. gemeinsamer Auftrag mit anteiliger Vorgabe) zählt weder als schneller noch als langsamer
  const faster = ratios.filter((r) => r.ratio < mine.ratio - 0.001).length;
  const slower = ratios.filter((r) => r.ratio > mine.ratio + 0.001).length;
  if (!slower) return null;
  if (faster === 0 && slower === ratios.length - 1) return 'Du warst in diesem Zeitraum am schnellsten im Team.';
  if (faster < Math.floor(ratios.length / 2)) return 'Du gehörst in diesem Zeitraum zu den Schnelleren im Team.';
  return null;
}

/**
 * Timer am selben Auftrag (nur Aufträge, keine Nacharbeit): gleiche Auftragsnummer – die Nummer ist eindeutig, auch
 * wenn der Artikel auf zwei Geräten doppelt angelegt wurde. Ohne Auftragsnummer: gleicher Artikel und Zeiträume, die
 * sich überschneiden (gleichzeitig daran gearbeitet).
 */
export function sameOrder(a: Job, b: Job): boolean {
  if (a.kind !== 'order' || b.kind !== 'order' || a.id === b.id) return false;
  // Display-Verheiratung und Gesamtmontage sind eigenständige Aufträge
  if ((a.section === 'display') !== (b.section === 'display')) return false;
  if (a.orderNo && b.orderNo) return a.orderNo === b.orderNo;
  if (!a.articleId || a.articleId !== b.articleId) return false;
  const end = (j: Job) => j.finishedAt ?? Number.MAX_SAFE_INTEGER;
  return a.startedAt < end(b) && b.startedAt < end(a);
}

/**
 * Artikel für den Vorgabe-Vergleich eines gemeinsamen Auftrags: der eigene, sonst der erste mit Vorgabezeiten –
 * mit den Vorgabezeiten des Teils (Display-Verheiratung / Gesamtmontage) des ersten Auftrags.
 */
export function orderArticle(jobs: Job[], byId: Map<string, Article>): Article | undefined {
  const section = jobs[0]?.section ?? null;
  const all = jobs
    .map((j) => articleForSection(j.articleId ? byId.get(j.articleId) : undefined, section))
    .filter((a): a is Article => !!a);
  const hasTargets = (a: Article) => Object.keys(a.targets ?? {}).length > 0;
  return all[0] && hasTargets(all[0]) ? all[0] : (all.find(hasTargets) ?? all[0]);
}

/** Schlüssel zum Zusammenfassen mehrerer Timer eines Auftrags */
export function orderKey(job: Job): string {
  const base = job.orderNo ? `${job.orderNo}|${job.articleId ?? ''}` : `job:${job.id}`;
  return job.section === 'display' ? `${base}|display` : base;
}

/**
 * Arbeitsbilanz = Vorgabe − Ist: positiv = schneller als geplant (Zeit gut), negativ = länger gebraucht.
 * So zeigt „+“ immer etwas Gutes, „−“ eine Überschreitung.
 */
export function balanceMs(actualMs: Millis, targetMs: Millis): Millis {
  return targetMs - actualMs;
}

/** „+1h 30m“ / „−45m“ (Bilanz in Zeit) */
export function formatBalance(ms: Millis): string {
  const rounded = Math.round(ms / 60_000) * 60_000;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${formatDuration(Math.abs(rounded))}`;
}

/** Bilanz in Prozent der Vorgabe (+ = schneller) aus der Abweichung (+ = länger) */
export function balancePct(delta: number | null): number | null {
  return delta === null ? null : -delta;
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
