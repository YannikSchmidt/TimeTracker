import { PATHS } from '../src/sync/engine';
import { memoryRemote } from '../src/sync/remote';
import { prepareConnect } from '../src/sync/setup';

it('erstes Verbinden legt das Team-Passwort an, danach wird es geprüft', async () => {
  const remote = memoryRemote('anna');
  expect(await prepareConnect(remote, 'irgendwas', false, 1000)).toEqual({ ok: false, needsNewPassword: true });
  expect(await prepareConnect(remote, 'kurz', true, 1000)).toMatchObject({ ok: false });
  const created = await prepareConnect(remote, 'langes-passwort', true, 1000);
  expect(created).toMatchObject({ ok: true, user: { login: 'anna' } });
  expect(remote.files.get(PATHS.meta)?.text).not.toContain('langes-passwort');

  const other = memoryRemote('ben', remote.files);
  expect(await prepareConnect(other, 'falsch-falsch', false, 1000)).toEqual({ ok: false, error: 'Das Team-Passwort ist falsch.' });
  expect(await prepareConnect(other, 'langes-passwort', false, 1000)).toMatchObject({ ok: true, user: { login: 'ben' } });
});
