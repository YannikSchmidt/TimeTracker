/**
 * Ablage der verschlüsselten Team-Dateien. Implementiert über die GitHub-API (github.ts);
 * für Tests gibt es eine Variante im Speicher (memoryRemote).
 */
export interface RemoteFile {
  sha: string;
  text: string;
}

export interface RemoteEntry {
  name: string;
  path: string;
  sha: string;
}

export interface RemoteUser {
  login: string;
  name: string | null;
}

export class ConflictError extends Error {
  constructor(path: string) {
    super(`Die Datei ${path} wurde inzwischen geändert.`);
    this.name = 'ConflictError';
  }
}

export class RemoteError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

export interface RemoteStore {
  whoAmI(): Promise<RemoteUser>;
  /** Prüft, ob das Daten-Repo erreichbar ist (wirft RemoteError mit verständlicher Meldung). */
  checkAccess(): Promise<void>;
  read(path: string): Promise<RemoteFile | null>;
  /** Schreibt die Datei; sha = null für neue Dateien. Wirft ConflictError, wenn sie sich geändert hat. */
  write(path: string, text: string, sha: string | null, message: string): Promise<string>;
  /** Dateien eines Ordners (leer, wenn es ihn nicht gibt). */
  list(dir: string): Promise<RemoteEntry[]>;
}

/** Ablage im Speicher – für Tests (mehrere „Geräte“ teilen sich ein Objekt). */
export function memoryRemote(login: string, files: Map<string, RemoteFile> = new Map()): RemoteStore & { files: Map<string, RemoteFile> } {
  let counter = 0;
  return {
    files,
    async whoAmI() {
      return { login, name: login };
    },
    async checkAccess() {},
    async read(path) {
      const f = files.get(path);
      return f ? { ...f } : null;
    },
    async write(path, text, sha) {
      const cur = files.get(path);
      if ((cur?.sha ?? null) !== sha) throw new ConflictError(path);
      const next = `sha-${++counter}-${Math.random().toString(36).slice(2, 8)}`;
      files.set(path, { sha: next, text });
      return next;
    },
    async list(dir) {
      const prefix = `${dir}/`;
      return [...files.entries()]
        .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map(([path, f]) => ({ name: path.slice(prefix.length), path, sha: f.sha }));
    },
  };
}
