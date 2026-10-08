import { classifyCode, type CodePatterns } from './codes';

/**
 * Wie oft ein Code gleich gelesen werden muss, bevor er gilt: Nummern im bekannten Aufbau (Auftrag, Gerät,
 * Front) zweimal, alles andere dreimal. Halb gelesene Strichcodes ergeben selten zweimal dasselbe – so werden
 * Teil- und Fehllesungen aussortiert.
 */
export function requiredReads(code: string, patterns: CodePatterns): number {
  return classifyCode(code, patterns) === 'unknown' ? 3 : 2;
}

/** Bestätigt Codes erst, wenn sie in mehreren der letzten Kamerabilder gleich erkannt wurden. */
export class ScanConfirm {
  private frames: string[][] = [];

  constructor(
    private readonly required: (code: string) => number,
    private readonly window = 6,
  ) {}

  /** Codes eines Kamerabilds eintragen; liefert die Codes, die jetzt oft genug gleich gelesen wurden. */
  push(codes: string[]): string[] {
    const frame = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
    this.frames.push(frame);
    if (this.frames.length > this.window) this.frames.shift();
    const counts = new Map<string, number>();
    for (const f of this.frames) for (const c of f) counts.set(c, (counts.get(c) ?? 0) + 1);
    return frame.filter((c) => (counts.get(c) ?? 0) >= this.required(c));
  }

  reset(): void {
    this.frames = [];
  }
}
