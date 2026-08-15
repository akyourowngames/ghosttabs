// Low-level IndexedDB access for GhostTab.
// All higher-level storage APIs live in ./index.ts and go through here.

export const DB_NAME = "ghosttab";
export const DB_VERSION = 1;

export const STORE_WORKSPACES = "workspaces";
export const STORE_CONTEXT = "contextItems";
export const STORE_STATE = "workspaceState";
export const STORE_META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_WORKSPACES)) {
        db.createObjectStore(STORE_WORKSPACES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CONTEXT)) {
        const store = db.createObjectStore(STORE_CONTEXT, { keyPath: "id" });
        store.createIndex("byWorkspace", "workspaceId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE, { keyPath: "workspaceId" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

/** Open (and create, if needed) the database. Safe to call repeatedly. */
export function initStorage(): Promise<IDBDatabase> {
  return openDB();
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export { openDB, wrap, txDone };
