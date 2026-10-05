import { DEFAULT_CODE_PATTERNS } from '../src/domain/codes';
import { splitSnapshot, mergePerson } from '../src/domain/merge';
import { createTeamMeta, encryptJson, WrongPasswordError } from '../src/sync/crypto';
import { createInvite, decodeInvite, encodeInvite, inviteUrl, openInvite, personId } from '../src/sync/invite';
import { memoryRemote } from '../src/sync/remote';
import { prepareInviteConnect } from '../src/sync/setup';

const ITER = 1_000;
const TOKEN = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab';

describe('Einladung', () => {
  it('Link enthält den Token nur verschlüsselt und lässt sich mit dem Passwort öffnen', async () => {
    const { meta, key } = await createTeamMeta('geheim-123', ITER);
    const payload = await createInvite(key, meta, 'TimeTracker-Data/TimeTracker-Daten', TOKEN);
    const url = inviteUrl('https://yannikschmidt.github.io', payload);
    expect(url.startsWith('https://yannikschmidt.github.io/TimeTracker/join#')).toBe(true);
    expect(url).not.toContain('github_pat');
    expect(atob(url.split('#')[1].replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('github_pat');

    // aus Link, reinem Code und mit Leerzeichen lesbar
    expect(decodeInvite(url)).toEqual(payload);
    expect(decodeInvite(`  ${encodeInvite(payload)}\n`)).toEqual(payload);
    expect(decodeInvite('A-2026-0815')).toBeNull();
    expect(decodeInvite('https://example.com/#nichtsbrauchbares_aber_lang_genug')).toBeNull();

    const opened = await openInvite(decodeInvite(url)!, 'geheim-123');
    expect(opened.token).toBe(TOKEN);
    expect(opened.repo).toBe('TimeTracker-Data/TimeTracker-Daten');
    await expect(openInvite(payload, 'falsch')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('QR-Inhalt bleibt kurz genug für einen gut scanbaren Code', async () => {
    const { meta, key } = await createTeamMeta('geheim-123', ITER);
    const url = inviteUrl('https://yannikschmidt.github.io', await createInvite(key, { ...meta, iterations: 600_000 }, 'TimeTracker-Data/TimeTracker-Daten', TOKEN));
    expect(url.length).toBeLessThan(600);
  });

  it('Kennung aus dem Namen', () => {
    expect(personId('  Max Müller ')).toBe('max-mueller');
    expect(personId('Jürgen Groß-Straße')).toBe('juergen-gross-strasse');
    expect(personId('Zoë')).toBe('zoe');
    expect(personId('!!!')).toBe('');
  });

  it('Verbinden prüft Schlüssel und fragt bei vorhandenem Namen nach', async () => {
    const { meta, key } = await createTeamMeta('geheim-123', ITER);
    const remote = memoryRemote('team-bot');
    expect(await prepareInviteConnect(remote, key, 'max', false)).toMatchObject({ ok: false, error: expect.stringContaining('kein Team') });
    await remote.write('meta.json', JSON.stringify(meta), null, 'x');
    expect(await prepareInviteConnect(remote, key, 'max', false)).toEqual({ ok: true, user: { login: 'team-bot', name: 'team-bot' } });

    await remote.write('people/max.enc', await encryptJson(key, {}), null, 'x');
    expect(await prepareInviteConnect(remote, key, 'max', false)).toEqual({ ok: false, nameTaken: true });
    expect(await prepareInviteConnect(remote, key, 'max', true)).toMatchObject({ ok: true });

    const other = await createTeamMeta('anderes-pw', ITER);
    expect(await prepareInviteConnect(remote, other.key, 'eva', false)).toMatchObject({ ok: false, error: expect.stringContaining('veraltet') });
  });

  it('Anzeigename wird in der eigenen Datei mitgespeichert und beim Zusammenführen behalten', () => {
    const data = { version: 2 as const, exportedAt: 0, jobs: [], entries: [], dimensions: [], values: [], articles: [], settings: { weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], defaultQuantity: 24, codePatterns: DEFAULT_CODE_PATTERNS } };
    const local = splitSnapshot(data, 'max-mueller', 'Max Müller').person;
    expect(local.name).toBe('Max Müller');
    const remote = { ...splitSnapshot(data, 'max-mueller').person };
    expect(mergePerson(local, remote, 0).name).toBe('Max Müller');
    expect(mergePerson(remote, local, 0).name).toBe('Max Müller');
  });
});
