import { checkTeamKey, createTeamMeta, unlockTeam, WrongPasswordError, type TeamMeta } from './crypto';
import { PATHS } from './engine';
import { ConflictError, RemoteError, type RemoteStore, type RemoteUser } from './remote';

export type PrepareResult =
  | { ok: true; key: CryptoKey; user: RemoteUser }
  | { ok: false; needsNewPassword: true }
  | { ok: false; error: string };

/**
 * Verbindung prüfen und Schlüssel ableiten:
 * Token gültig? Repo erreichbar? Gibt es schon ein Team-Passwort (meta.json)?
 */
export async function prepareConnect(
  remote: RemoteStore,
  password: string,
  createPassword: boolean,
  iterations?: number,
): Promise<PrepareResult> {
  try {
    const user = await remote.whoAmI();
    await remote.checkAccess();
    const metaFile = await remote.read(PATHS.meta);
    if (!metaFile) {
      if (!createPassword) return { ok: false, needsNewPassword: true };
      if (password.length < 8) return { ok: false, error: 'Das Team-Passwort muss mindestens 8 Zeichen haben.' };
      const { meta, key } = await createTeamMeta(password, iterations);
      await remote.write(PATHS.meta, JSON.stringify(meta, null, 2), null, `${user.login}: Team-Passwort eingerichtet`);
      return { ok: true, key, user };
    }
    const key = await unlockTeam(JSON.parse(metaFile.text) as TeamMeta, password);
    return { ok: true, key, user };
  } catch (e) {
    if (e instanceof WrongPasswordError) return { ok: false, error: 'Das Team-Passwort ist falsch.' };
    if (e instanceof ConflictError) return { ok: false, error: 'Jemand hat gerade das Team-Passwort eingerichtet – bitte erneut versuchen.' };
    if (e instanceof RemoteError) return { ok: false, error: e.message };
    return { ok: false, error: `Verbinden fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export type InviteResult =
  | { ok: true; user: RemoteUser }
  /** Name wird schon verwendet – evtl. dieselbe Person auf einem weiteren Gerät */
  | { ok: false; nameTaken: true }
  | { ok: false; error: string };

/**
 * Verbinden über eine Einladung: Team-Token gültig? Repo erreichbar? Passt der Schlüssel zum Team?
 * Gibt es schon eine Person mit dieser Kennung, wird nachgefragt (confirmed = Person hat bestätigt, dass sie es ist).
 */
export async function prepareInviteConnect(remote: RemoteStore, key: CryptoKey, person: string, confirmed: boolean): Promise<InviteResult> {
  try {
    const user = await remote.whoAmI();
    await remote.checkAccess();
    const metaFile = await remote.read(PATHS.meta);
    if (!metaFile) return { ok: false, error: 'Im Daten-Repo ist noch kein Team eingerichtet.' };
    if (!(await checkTeamKey(JSON.parse(metaFile.text) as TeamMeta, key)))
      return { ok: false, error: 'Die Einladung ist veraltet (das Team-Passwort wurde geändert). Bitte eine neue anfordern.' };
    if (!confirmed) {
      const people = await remote.list(PATHS.peopleDir);
      if (people.some((f) => f.name === `${person}.enc`)) return { ok: false, nameTaken: true };
    }
    return { ok: true, user };
  } catch (e) {
    if (e instanceof RemoteError) return { ok: false, error: e.message };
    return { ok: false, error: `Verbinden fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` };
  }
}
