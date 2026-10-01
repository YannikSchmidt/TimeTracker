/**
 * Browser: Datei über das Teilen-Menü (iPhone/Android) oder als Download weitergeben.
 * Liefert ggf. einen Hinweis für die Anzeige.
 */
export async function shareTextFile(name: string, content: string, mimeType: string): Promise<string | null> {
  const file = new File([content], name, { type: mimeType });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: name });
      return null;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      // sonst: Download versuchen
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `${name} wurde heruntergeladen.`;
}

/** Textdatei auswählen und lesen (null = abgebrochen). */
export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}
