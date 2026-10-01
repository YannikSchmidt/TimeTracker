/** Nativ: Updates kommen über den App-Build (später ggf. EAS Update) – hier nichts zu tun. */
export interface UpdateState {
  supported: boolean;
  /** Version auf dem Server, falls neuer als die laufende */
  available: string | null;
  checking: boolean;
  lastCheck: number | null;
}

const NATIVE: UpdateState = { supported: false, available: null, checking: false, lastCheck: null };

export function useAppUpdate(): UpdateState & { check: () => Promise<void>; apply: () => void } {
  return { ...NATIVE, check: async () => {}, apply: () => {} };
}

export function setupUpdates(): void {}
