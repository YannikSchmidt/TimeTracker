import { BASE_URL } from '../lib/baseUrl';
import { decryptText, deriveKey, encryptText, fromBase64, WrongPasswordError, type Encrypted, type TeamMeta } from './crypto';

/**
 * Einladung per QR-Code/Link: enthält Daten-Repo und einen Team-Token – der Token ist mit dem
 * Team-Schlüssel verschlüsselt. Wer eingeladen wird, braucht also zusätzlich das Team-Passwort,
 * aber kein eigenes GitHub-Konto. Salt und Runden (nicht geheim, wie in meta.json) stecken mit drin,
 * damit sich der Schlüssel ohne Zugriff aufs Repo ableiten lässt.
 */
export interface InvitePayload {
  v: 1;
  /** Daten-Repo "organisation/repo" */
  r: string;
  /** Salt (Base64) und Runden der Schlüsselableitung – wie in meta.json */
  s: string;
  i: number;
  /** verschlüsselter Token */
  t: Encrypted;
}

export const INVITE_ROUTE = 'join';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
}

export function encodeInvite(payload: InvitePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Liest eine Einladung aus Link, QR-Inhalt oder reinem Code; null, wenn es keine ist. */
export function decodeInvite(input: string): InvitePayload | null {
  const text = input.trim();
  const code = text.includes('#') ? text.slice(text.lastIndexOf('#') + 1) : text;
  if (!/^[A-Za-z0-9_-]{20,}$/.test(code)) return null;
  try {
    const p = JSON.parse(fromBase64Url(code)) as InvitePayload;
    const valid =
      p?.v === 1 &&
      typeof p.r === 'string' &&
      /^[\w.-]+\/[\w.-]+$/.test(p.r) &&
      typeof p.s === 'string' &&
      Number.isInteger(p.i) &&
      p.i >= 1 &&
      typeof p.t?.iv === 'string' &&
      typeof p.t?.data === 'string';
    return valid ? p : null;
  } catch {
    return null;
  }
}

/** Link zur Einladung; der Code steht hinter „#“ und wird daher nie an einen Server gesendet. */
export function inviteUrl(origin: string, payload: InvitePayload): string {
  return `${origin}${BASE_URL}${INVITE_ROUTE}#${encodeInvite(payload)}`;
}

export async function createInvite(key: CryptoKey, meta: Pick<TeamMeta, 'salt' | 'iterations'>, repo: string, token: string): Promise<InvitePayload> {
  return { v: 1, r: repo, s: meta.salt, i: meta.iterations, t: await encryptText(key, token) };
}

/** Schlüssel aus dem Team-Passwort ableiten und den Token entschlüsseln; wirft WrongPasswordError. */
export async function openInvite(payload: InvitePayload, password: string): Promise<{ key: CryptoKey; token: string; repo: string }> {
  const key = await deriveKey(password, fromBase64(payload.s), payload.i);
  try {
    return { key, token: await decryptText(key, payload.t), repo: payload.r };
  } catch {
    throw new WrongPasswordError();
  }
}

/** Kennung (Dateiname) aus dem Namen: „Max Müller“ → „max-mueller“. */
export function personId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
