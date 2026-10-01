import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

/** Textdatei über das Teilen-Menü weitergeben. Liefert ggf. einen Hinweis für die Anzeige. */
export async function shareTextFile(name: string, content: string, mimeType: string): Promise<string | null> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (await isAvailableAsync()) {
    await shareAsync(file.uri, { mimeType, dialogTitle: name });
    return null;
  }
  return `Datei gespeichert unter: ${file.uri}`;
}

/** Textdatei auswählen und lesen (null = abgebrochen). */
export async function pickTextFile(): Promise<string | null> {
  const result = await getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  return new File(result.assets[0].uri).text();
}
