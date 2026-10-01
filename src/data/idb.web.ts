/**
 * Minimaler Schlüssel-Wert-Speicher auf IndexedDB (Browser).
 * Kann beliebige strukturierte Werte speichern – auch nicht auslesbare CryptoKeys.
 */
const DB_NAME = 'timetracker';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const idb = {
  get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
  set: (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key)),
  delete: (key: string) => run<void>('readwrite', (s) => s.delete(key)),
};

/** true, wenn IndexedDB nutzbar ist (z.B. nicht in manchen privaten Fenstern). */
export async function idbAvailable(): Promise<boolean> {
  try {
    await idb.get('__probe__');
    return true;
  } catch {
    return false;
  }
}
