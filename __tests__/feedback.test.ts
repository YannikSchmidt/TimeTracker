import { buildIssue, describePlatform, sendPending, type FeedbackIssue, type IssueDraft, type PendingFeedback } from '../src/sync/feedback';
import { GitHubStore } from '../src/sync/github';
import { RemoteError } from '../src/sync/remote';
import { isNewer, shortVersion } from '../src/lib/version';

const ctx = { author: '@anna', appVersion: 'abc', platform: 'iOS · Safari' };
const item = (text: string, extra: Partial<PendingFeedback> = {}): PendingFeedback => ({
  id: text,
  category: 'idea',
  text,
  createdAt: Date.UTC(2026, 9, 1, 8, 30),
  ...extra,
});

describe('buildIssue', () => {
  it('erste Zeile wird Titel, Kontext im Text, Labels je Kategorie', () => {
    const d = buildIssue(item('\n  Export als PDF  \nwäre praktisch für den Chef'), ctx);
    expect(d.title).toBe('Export als PDF');
    expect(d.body).toContain('wäre praktisch für den Chef');
    expect(d.body).toContain('@anna');
    expect(d.body).toContain('**App-Version:** abc');
    expect(d.body).toContain('2026-10-01 08:30');
    expect(d.labels).toEqual(['vorschlag', 'idee']);
    expect(buildIssue(item('x', { category: 'bug' }), ctx).labels).toEqual(['vorschlag', 'fehler']);
    expect(buildIssue(item('x', { category: 'other' }), ctx).labels).toEqual(['vorschlag']);
  });

  it('kürzt lange Titel', () => {
    const d = buildIssue(item('a'.repeat(200)), ctx);
    expect(d.title).toHaveLength(80);
    expect(d.title.endsWith('…')).toBe(true);
  });
});

describe('sendPending', () => {
  it('sendet der Reihe nach und behält bei Fehler den Rest', async () => {
    const sent: IssueDraft[] = [];
    let n = 0;
    const target = {
      async createIssue(d: IssueDraft): Promise<FeedbackIssue> {
        if (++n === 2) throw new RemoteError('Keine Verbindung zu GitHub.');
        sent.push(d);
        return { number: n, title: d.title, state: 'open', url: '', createdAt: 0, comments: 0 };
      },
    };
    const r = await sendPending([item('eins'), item('zwei'), item('drei')], target, ctx);
    expect(sent.map((d) => d.title)).toEqual(['eins']);
    expect(r.remaining.map((f) => f.text)).toEqual(['zwei', 'drei']);
    expect(r.error?.message).toContain('Keine Verbindung');
  });
});

describe('GitHubStore Issues', () => {
  function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const { status, body } = handler(url, init);
      return { status, ok: status < 300, headers: new Map(), json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  const issue = { number: 7, title: 'T', state: 'open', html_url: 'https://github.com/o/r/issues/7', created_at: '2026-10-01T08:00:00Z', comments: 2 };

  it('legt Issues an und listet eigene Vorschläge', async () => {
    const { f, calls } = fakeFetch((url, init) =>
      init.method === 'POST' ? { status: 201, body: issue } : { status: 200, body: [issue, { ...issue, number: 8, pull_request: {} }] },
    );
    const gh = new GitHubStore('tok', 'o/r', f);
    const created = await gh.createIssue({ title: 'T', body: 'B', labels: ['vorschlag'] });
    expect(created).toMatchObject({ number: 7, state: 'open', url: issue.html_url, comments: 2 });
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r/issues');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ title: 'T', body: 'B', labels: ['vorschlag'] });
    const list = await gh.listIssues({ creator: 'anna' });
    expect(list.map((i) => i.number)).toEqual([7]);
    expect(calls[1].url).toContain('labels=vorschlag');
    expect(calls[1].url).toContain('creator=anna');
  });

  it('fehlende Berechtigung → verständliche Meldung', async () => {
    const { f } = fakeFetch(() => ({ status: 403, body: { message: 'Resource not accessible by personal access token' } }));
    await expect(new GitHubStore('tok', 'o/r', f).createIssue({ title: 'T', body: '', labels: [] })).rejects.toThrow(
      'Issues: Read and write',
    );
  });
});

describe('Version', () => {
  it('erkennt neue Versionen', () => {
    expect(isNewer('b', 'a')).toBe(true);
    expect(isNewer('a', 'a')).toBe(false);
    expect(isNewer(null, 'a')).toBe(false);
    expect(isNewer('b', 'dev')).toBe(false);
    expect(shortVersion('0123456789abcdef0123456789abcdef01234567')).toBe('0123456');
    expect(shortVersion('dev')).toBe('dev');
  });

  it('Gerätebeschreibung', () => {
    expect(describePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18.0 Mobile Safari/604.1', true)).toBe(
      'iOS · Safari · App (Home-Bildschirm)',
    );
    expect(describePlatform('Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36', false)).toBe('Android · Chrome');
  });
});
