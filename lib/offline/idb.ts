const DB_NAME = "worklog-offline";
const DB_VERSION = 1;

const STORES = {
  days: "days",
  settings: "settings",
  azkar: "azkar",
  syncQueue: "syncQueue",
  meta: "meta",
} as const;

type StoreName = keyof typeof STORES;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.days)) {
        db.createObjectStore(STORES.days, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.azkar)) {
        db.createObjectStore(STORES.azkar, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.syncQueue)) {
        const q = db.createObjectStore(STORES.syncQueue, { keyPath: "id" });
        q.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result as { value?: T } | undefined;
      resolve(row?.value ?? null);
    };
    tx.oncomplete = () => db.close();
  });
}

async function idbSet<T>(store: StoreName, key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put({ key, value });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const rows = (req.result as { value: T }[]) ?? [];
      resolve(rows.map((r) => r.value));
    };
    tx.oncomplete = () => db.close();
  });
}

export function daysKey(userId: string, personId: string): string {
  return `${userId}:${personId}`;
}

export function azkarKey(
  userId: string,
  personId: string,
  dateKey: string,
  period: string
): string {
  return `${userId}:${personId}:${dateKey}:${period}`;
}

export const offlineIdb = {
  get: idbGet,
  set: idbSet,
  delete: idbDelete,
  getAll: idbGetAll,
};
