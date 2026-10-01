import { fromBase64, toBase64 } from './crypto';
import { FEEDBACK_LABEL, type FeedbackIssue, type IssueDraft, type IssueTarget } from './feedback';
import { ConflictError, RemoteError, type RemoteEntry, type RemoteFile, type RemoteStore, type RemoteUser } from './remote';

const API = 'https://api.github.com';

interface ContentResponse {
  type: string;
  name: string;
  path: string;
  sha: string;
  size: number;
  content?: string;
  encoding?: string;
}

/**
 * Daten-Repo über die GitHub-Contents-API, mit persönlichem Token.
 * Jeder Schreibvorgang ist ein Commit des Token-Besitzers → nachvollziehbar, wer was geändert hat.
 * Lesezugriffe nutzen ETags (304 zählt nicht gegen das Rate-Limit).
 */
export class GitHubStore implements RemoteStore, IssueTarget {
  private readonly etags = new Map<string, { etag: string; body: unknown }>();

  constructor(
    private readonly token: string,
    /** "organisation/repo" */
    private readonly repo: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async request(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
    const url = `${API}${path}`;
    const cached = method === 'GET' ? this.etags.get(url) : undefined;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(cached ? { 'If-None-Match': cached.etag } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new RemoteError('Keine Verbindung zu GitHub.');
    }
    if (res.status === 304 && cached) return { status: 200, data: cached.body };
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (method === 'GET' && res.ok) {
      const etag = res.headers.get('etag');
      if (etag) this.etags.set(url, { etag, body: data });
    }
    return { status: res.status, data };
  }

  private fail(status: number, data: unknown, what: string): never {
    const message = (data as { message?: string } | null)?.message ?? '';
    if (status === 401) throw new RemoteError('Der Token ist ungültig oder abgelaufen.', status);
    if (status === 403 && /rate limit/i.test(message)) throw new RemoteError('GitHub-Limit erreicht – bitte später erneut versuchen.', status);
    if (status === 403 || status === 404)
      throw new RemoteError(`Kein Zugriff auf ${this.repo}. Hat der Token Lese-/Schreibrecht für „Contents“ und ist er freigegeben?`, status);
    throw new RemoteError(`GitHub-Fehler bei ${what} (${status}${message ? `: ${message}` : ''}).`, status);
  }

  async whoAmI(): Promise<RemoteUser> {
    const { status, data } = await this.request('GET', '/user');
    if (status !== 200) this.fail(status, data, 'Anmeldung');
    const u = data as { login: string; name: string | null };
    return { login: u.login, name: u.name };
  }

  async checkAccess(): Promise<void> {
    const { status, data } = await this.request('GET', `/repos/${this.repo}`);
    if (status !== 200) this.fail(status, data, 'Repo-Zugriff');
  }

  async read(path: string): Promise<RemoteFile | null> {
    const { status, data } = await this.request('GET', `/repos/${this.repo}/contents/${path}`);
    if (status === 404) return null;
    if (status !== 200) this.fail(status, data, `Lesen von ${path}`);
    const file = data as ContentResponse;
    let b64 = file.content;
    // Dateien über 1 MB liefert die Contents-API ohne Inhalt → über die Blob-API laden
    if (!b64 && file.size > 0) {
      const blob = await this.request('GET', `/repos/${this.repo}/git/blobs/${file.sha}`);
      if (blob.status !== 200) this.fail(blob.status, blob.data, `Lesen von ${path}`);
      b64 = (blob.data as { content: string }).content;
    }
    return { sha: file.sha, text: new TextDecoder().decode(fromBase64((b64 ?? '').replace(/\s/g, ''))) };
  }

  async write(path: string, text: string, sha: string | null, message: string): Promise<string> {
    const body = { message, content: toBase64(new TextEncoder().encode(text)), ...(sha ? { sha } : {}) };
    const { status, data } = await this.request('PUT', `/repos/${this.repo}/contents/${path}`, body);
    if (status === 409 || (status === 422 && /sha/i.test(JSON.stringify(data)))) throw new ConflictError(path);
    if (status !== 200 && status !== 201) this.fail(status, data, `Speichern von ${path}`);
    this.etags.delete(`${API}/repos/${this.repo}/contents/${path}`);
    return (data as { content: { sha: string } }).content.sha;
  }

  async list(dir: string): Promise<RemoteEntry[]> {
    const { status, data } = await this.request('GET', `/repos/${this.repo}/contents/${dir}`);
    if (status === 404) return [];
    if (status !== 200) this.fail(status, data, `Lesen von ${dir}`);
    return (data as ContentResponse[]).filter((f) => f.type === 'file').map((f) => ({ name: f.name, path: f.path, sha: f.sha }));
  }

  // --- Verbesserungsvorschläge (Issues) ---------------------------------------

  private failIssues(status: number, data: unknown, what: string): never {
    if (status === 403 || status === 404 || status === 410) {
      const message = (data as { message?: string } | null)?.message ?? '';
      if (!/rate limit/i.test(message))
        throw new RemoteError(
          status === 410
            ? `Im Repo ${this.repo} sind Issues ausgeschaltet.`
            : 'Der Token darf keine Vorschläge anlegen. Bitte beim Token die Berechtigung „Issues: Read and write“ ergänzen.',
          status,
        );
    }
    this.fail(status, data, what);
  }

  async createIssue(draft: IssueDraft): Promise<FeedbackIssue> {
    const { status, data } = await this.request('POST', `/repos/${this.repo}/issues`, draft);
    if (status !== 201) this.failIssues(status, data, 'Senden des Vorschlags');
    return toFeedbackIssue(data as IssueResponse);
  }

  /** Vorschläge (Label „vorschlag“), optional nur die einer Person; neueste zuerst. */
  async listIssues(creator?: string): Promise<FeedbackIssue[]> {
    const params = new URLSearchParams({ labels: FEEDBACK_LABEL, state: 'all', per_page: '50', ...(creator ? { creator } : {}) });
    const { status, data } = await this.request('GET', `/repos/${this.repo}/issues?${params}`);
    if (status !== 200) this.failIssues(status, data, 'Laden der Vorschläge');
    return (data as IssueResponse[]).filter((i) => !i.pull_request).map(toFeedbackIssue);
  }
}

interface IssueResponse {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  comments: number;
  pull_request?: unknown;
}

const toFeedbackIssue = (i: IssueResponse): FeedbackIssue => ({
  number: i.number,
  title: i.title,
  state: i.state,
  url: i.html_url,
  createdAt: Date.parse(i.created_at),
  comments: i.comments ?? 0,
});
