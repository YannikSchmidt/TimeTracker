/**
 * Verbesserungsvorschläge: werden als Issues im privaten Daten-Repo abgelegt.
 * Issues sind NICHT verschlüsselt – deshalb enthalten sie nur, was die Person selbst schreibt,
 * plus App-Version und Gerät (keine Zeit- oder Auftragsdaten).
 */
export type FeedbackCategory = 'idea' | 'bug' | 'other';

export const FEEDBACK_CATEGORIES: { key: FeedbackCategory; label: string }[] = [
  { key: 'idea', label: 'Idee' },
  { key: 'bug', label: 'Fehler' },
  { key: 'other', label: 'Sonstiges' },
];

/** Label, an dem die App ihre Vorschläge erkennt */
export const FEEDBACK_LABEL = 'vorschlag';
const CATEGORY_LABEL: Record<FeedbackCategory, string | null> = { idea: 'idee', bug: 'fehler', other: null };

/** Lokal vorgemerkter Vorschlag (wird gesendet, sobald eine Verbindung besteht). */
export interface PendingFeedback {
  id: string;
  category: FeedbackCategory;
  text: string;
  createdAt: number;
}

export interface FeedbackContext {
  /** z.B. „@anna“ (eigenes GitHub-Konto) oder „Max Müller (Team-Zugang)“ */
  author: string;
  appVersion: string;
  platform: string;
}

export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

/** Vorschlag als Issue auf GitHub */
export interface FeedbackIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  url: string;
  createdAt: number;
  comments: number;
}

const TITLE_MAX = 80;
export const AUTHOR_PREFIX = '**Von:** ';

export function buildIssue(f: Pick<PendingFeedback, 'category' | 'text' | 'createdAt'>, ctx: FeedbackContext): IssueDraft {
  const text = f.text.trim();
  const firstLine = text.split('\n').find((l) => l.trim())?.trim() ?? '';
  const title = firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1).trimEnd()}…` : firstLine;
  const kind = FEEDBACK_CATEGORIES.find((c) => c.key === f.category)?.label ?? 'Sonstiges';
  const body = [
    text,
    '',
    '---',
    `**Art:** ${kind}  `,
    `${AUTHOR_PREFIX}${ctx.author}  `,
    `**Datum:** ${new Date(f.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC  `,
    `**App-Version:** ${ctx.appVersion}  `,
    `**Gerät:** ${ctx.platform}`,
    '',
    '_Gesendet aus der TimeTracker-App._',
  ].join('\n');
  const extra = CATEGORY_LABEL[f.category];
  return { title: title || 'Verbesserungsvorschlag', body, labels: extra ? [FEEDBACK_LABEL, extra] : [FEEDBACK_LABEL] };
}

export interface IssueTarget {
  createIssue(draft: IssueDraft): Promise<FeedbackIssue>;
}

/**
 * Vorgemerkte Vorschläge der Reihe nach senden. Bricht beim ersten Fehler ab
 * (z.B. offline) und liefert die noch offenen zurück.
 */
export async function sendPending(
  pending: PendingFeedback[],
  target: IssueTarget,
  ctx: FeedbackContext,
): Promise<{ sent: FeedbackIssue[]; remaining: PendingFeedback[]; error: Error | null }> {
  const sent: FeedbackIssue[] = [];
  for (let i = 0; i < pending.length; i++) {
    try {
      sent.push(await target.createIssue(buildIssue(pending[i], ctx)));
    } catch (e) {
      return { sent, remaining: pending.slice(i), error: e instanceof Error ? e : new Error(String(e)) };
    }
  }
  return { sent, remaining: [], error: null };
}

/** Kurze Gerätebeschreibung aus dem User-Agent (ohne Versionsdetails). */
export function describePlatform(userAgent: string, standalone: boolean): string {
  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'unbekannt';
  const browser = /EdgA?\//.test(userAgent)
    ? 'Edge'
    : /CriOS|Chrome\//.test(userAgent)
      ? 'Chrome'
      : /FxiOS|Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  return `${os} · ${browser}${standalone ? ' · App (Home-Bildschirm)' : ''}`;
}
