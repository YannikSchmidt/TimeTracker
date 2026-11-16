/**
 * Browser/PWA: Systembenachrichtigungen über den Service Worker. Sie kommen nur, solange die App offen oder im
 * Hintergrund noch aktiv ist – ohne Server gibt es keine Nachricht bei ganz geschlossener App (vor allem iPhone).
 * Auf dem iPhone gehen Benachrichtigungen nur in der zum Home-Bildschirm hinzugefügten App.
 */
export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notifyPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return notifyPermission();
  }
}

export function appHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (notifyPermission() !== 'granted') return;
  const options = { body, tag, requireInteraction: true };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
    // Benachrichtigung ist ein Komfort – das Fenster in der App erscheint trotzdem.
  }
}
