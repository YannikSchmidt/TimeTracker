/**
 * Ende-zu-Ende-Verschlüsselung der Team-Daten (WebCrypto).
 * Aus dem Team-Passwort wird per PBKDF2-SHA256 ein AES-256-GCM-Schlüssel abgeleitet.
 * Das Passwort verlässt nie das Gerät; GitHub sieht nur verschlüsselte Daten.
 */

export const DEFAULT_ITERATIONS = 600_000;
const VERIFIER_TEXT = 'timetracker:passwort-ok';

/** Öffentliche Parameter im Daten-Repo (meta.json) – enthalten nichts Geheimes. */
export interface TeamMeta {
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  /** Verschlüsselter Prüftext: erkennt ein falsches Passwort */
  verifier: Encrypted;
}

export interface Encrypted {
  v: 1;
  iv: string;
  data: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Das Passwort ist falsch.');
    this.name = 'WrongPasswordError';
  }
}

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Verschlüsselung wird von diesem Browser nicht unterstützt (HTTPS nötig).');
  return s;
};

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // nicht auslesbar – kann sicher im Browser gespeichert werden
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(key: CryptoKey, text: string): Promise<Encrypted> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

export async function decryptText(key: CryptoKey, enc: Encrypted): Promise<string> {
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(enc.iv) }, key, fromBase64(enc.data));
  return new TextDecoder().decode(plain);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  return JSON.stringify(await encryptText(key, JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, text: string): Promise<T> {
  return JSON.parse(await decryptText(key, JSON.parse(text) as Encrypted)) as T;
}

/** Neues Team-Passwort einrichten: liefert meta.json-Inhalt und Schlüssel. */
export async function createTeamMeta(password: string, iterations = DEFAULT_ITERATIONS): Promise<{ meta: TeamMeta; key: CryptoKey }> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, iterations);
  const verifier = await encryptText(key, VERIFIER_TEXT);
  return { meta: { version: 1, kdf: 'PBKDF2-SHA256', iterations, salt: toBase64(salt), verifier }, key };
}

/** Schlüssel aus dem Passwort ableiten und prüfen; wirft WrongPasswordError. */
export async function unlockTeam(meta: TeamMeta, password: string): Promise<CryptoKey> {
  const key = await deriveKey(password, fromBase64(meta.salt), meta.iterations);
  try {
    if ((await decryptText(key, meta.verifier)) === VERIFIER_TEXT) return key;
  } catch {
    // falsches Passwort → Entschlüsselung schlägt fehl
  }
  throw new WrongPasswordError();
}
