/**
 * Nummern am Aufbau erkennen, damit beim Scannen die Reihenfolge egal ist.
 * Muster: Ziffern und „*“ (= beliebige Ziffer), mehrere durch Komma getrennt.
 */
export interface CodePatterns {
  /** Auftragsnummern, z.B. „25*****, 26*****, 27*****“ */
  order: string;
  /** Artikelnummern von Gesamtgeräten, z.B. „07******“ */
  device: string;
  /** Artikelnummern von Fronten/Einzelteilen, z.B. „500000****“ */
  part: string;
}

export const DEFAULT_CODE_PATTERNS: CodePatterns = {
  order: '25*****, 26*****, 27*****',
  device: '07******',
  part: '500000****',
};

export type CodeKind = 'order' | 'device' | 'part' | 'unknown';

export const CODE_KIND_LABEL: Record<CodeKind, string> = {
  order: 'Auftrag',
  device: 'Gesamtgerät',
  part: 'Front/Einzelteil',
  unknown: 'unbekannt',
};

function toRegex(pattern: string): RegExp | null {
  const p = pattern.trim();
  if (!p) return null;
  const body = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '\\d');
  return new RegExp(`^${body}$`);
}

export function matchesPatterns(code: string, patterns: string): boolean {
  const c = code.trim();
  return patterns
    .split(',')
    .map(toRegex)
    .some((re) => !!re && re.test(c));
}

export function classifyCode(code: string, patterns: CodePatterns = DEFAULT_CODE_PATTERNS): CodeKind {
  if (matchesPatterns(code, patterns.order)) return 'order';
  if (matchesPatterns(code, patterns.device)) return 'device';
  if (matchesPatterns(code, patterns.part)) return 'part';
  return 'unknown';
}

export const isArticleKind = (kind: CodeKind) => kind === 'device' || kind === 'part';

/** Sieht wie eine Nummer aus (Ziffern, ggf. mit Trennzeichen) – sonst ist es eher eine Bezeichnung. */
export function looksLikeNumber(text: string): boolean {
  const t = text.trim();
  return /\d/.test(t) && /^[\dA-Za-z./_-]+$/.test(t) && (t.match(/\d/g)?.length ?? 0) >= t.replace(/[./_-]/g, '').length / 2;
}
