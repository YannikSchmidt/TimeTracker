import { useEffect, useRef } from 'react';

import type { ScanKind } from '../components/barcode.web';
import { useQuery } from '../data/DataProvider';
import { requiredReads, ScanConfirm } from '../domain/scan';
import { DEFAULT_SETTINGS } from '../domain/types';

/**
 * Wie oft ein Code gleich gelesen werden muss, bevor der Scanner ihn meldet. QR-Codes haben eine eigene
 * Fehlerkorrektur und gelten sofort; Auftrags-/Artikelcodes je nach Aufbau zwei- bzw. dreimal.
 */
export function useRequiredReads(kind: ScanKind): (code: string) => number {
  const { data: settings } = useQuery((r) => r.settings.get());
  const patterns = settings?.codePatterns ?? DEFAULT_SETTINGS.codePatterns;
  return (code: string) => (kind === 'qr' ? 1 : requiredReads(code, patterns));
}

/**
 * Für Kameras, die jeden erkannten Code einzeln melden (expo-camera): `accept(code)` ist erst wahr, wenn der Code
 * oft genug gleich gelesen wurde. `reset()` beim Öffnen des Scanners.
 */
export function useScanConfirm(kind: ScanKind): { accept: (code: string) => boolean; reset: () => void } {
  const required = useRequiredReads(kind);
  const state = useRef<{ confirm: ScanConfirm | null; required: (code: string) => number }>({ confirm: null, required });
  useEffect(() => {
    state.current.required = required;
  });
  return {
    accept: (code: string) => {
      const s = state.current;
      s.confirm ??= new ScanConfirm((c) => s.required(c));
      return s.confirm.push([code]).includes(code.trim());
    },
    reset: () => state.current.confirm?.reset(),
  };
}
