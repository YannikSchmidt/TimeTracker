/** Version dieses Builds (Commit des Pages-Workflows), lokal „dev“. */
export const APP_VERSION: string = process.env.EXPO_PUBLIC_APP_VERSION || 'dev';

/** Kurzform für die Anzeige, z.B. „a1b2c3d“. */
export function shortVersion(version: string = APP_VERSION): string {
  return /^[0-9a-f]{40}$/i.test(version) ? version.slice(0, 7) : version;
}

/** Ist auf dem Server eine andere (neuere) Version veröffentlicht? */
export function isNewer(remote: string | null | undefined, current: string = APP_VERSION): boolean {
  return !!remote && current !== 'dev' && remote !== current;
}
