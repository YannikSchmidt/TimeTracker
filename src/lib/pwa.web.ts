import { BASE_URL } from './baseUrl';

/**
 * Service Worker registrieren (Offline-Start) und dauerhaften Speicher anfragen,
 * damit der Browser die lokalen Daten nicht von selbst löscht.
 */
export function setupPwa(): void {
  if (typeof window === 'undefined') return;
  const onOwnSite = window.location.pathname.startsWith(BASE_URL);
  if (onOwnSite && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${BASE_URL}sw.js`, { scope: BASE_URL }).catch(() => {
      // Offline-Start ist ein Komfort – die App funktioniert auch ohne.
    });
  }
  navigator.storage?.persist?.().catch(() => {});
}
