/**
 * Vorbelegung für die Einrichtung: privates Daten-Repo des Teams ("organisation/repo").
 * Kann beim Verbinden geändert werden.
 */
export const DEFAULT_DATA_REPO = 'TimeTracker-Data/TimeTracker-Daten';

/** Seite zum Erstellen eines persönlichen Tokens (fine-grained, nur für das Daten-Repo). */
export function tokenUrl(repo: string): string {
  const owner = repo.split('/')[0] ?? '';
  const params = new URLSearchParams({
    name: 'TimeTracker',
    description: 'Zeiterfassung: verschlüsselte Team-Daten und Verbesserungsvorschläge',
    ...(owner ? { target_name: owner } : {}),
    expires_in: '366',
    contents: 'write',
    issues: 'write',
  });
  return `https://github.com/settings/personal-access-tokens/new?${params}`;
}

export function normalizeRepo(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}
