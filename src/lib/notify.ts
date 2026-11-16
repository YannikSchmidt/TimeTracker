/** Native App: Systembenachrichtigungen sind (noch) nicht eingebunden – die Erinnerung erscheint in der App. */
export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function notifyPermission(): NotifyPermission {
  return 'unsupported';
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  return 'unsupported';
}

/** Läuft die App gerade im Hintergrund (nicht sichtbar)? */
export function appHidden(): boolean {
  return false;
}

export async function showNotification(_title: string, _body: string, _tag: string): Promise<void> {}
