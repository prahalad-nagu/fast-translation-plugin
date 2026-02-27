import type { PersistentTranslationCache } from "../types.js";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface IndexedDBLike {
  open(name: string, version?: number): any;
}

export interface LocalStoragePersistentCacheOptions {
  keyPrefix?: string;
  storage?: StorageLike;
}

export interface IndexedDBPersistentCacheOptions {
  dbName?: string;
  storeName?: string;
  version?: number;
  indexedDB?: IndexedDBLike;
}

const DEFAULT_PREFIX = "fast-translation:";
const DEFAULT_DB_NAME = "fast-translation-plugin";
const DEFAULT_STORE_NAME = "translations";

export function createLocalStoragePersistentCache(
  options: LocalStoragePersistentCacheOptions = {},
): PersistentTranslationCache {
  const storage = options.storage ?? getRuntimeLocalStorage();
  const prefix = options.keyPrefix ?? DEFAULT_PREFIX;

  return {
    async get(key: string): Promise<string | undefined> {
      const value = storage.getItem(prefix + key);
      return value ?? undefined;
    },
    async set(key: string, value: string): Promise<void> {
      storage.setItem(prefix + key, value);
    },
  };
}

export function createIndexedDBPersistentCache(
  options: IndexedDBPersistentCacheOptions = {},
): PersistentTranslationCache {
  const dbName = options.dbName ?? DEFAULT_DB_NAME;
  const storeName = options.storeName ?? DEFAULT_STORE_NAME;
  const version = options.version ?? 1;
  const indexedDBFactory = options.indexedDB ?? getRuntimeIndexedDB();

  let dbPromise: Promise<any> | undefined;

  const getDb = (): Promise<any> => {
    if (!dbPromise) {
      dbPromise = openIndexedDB(indexedDBFactory, dbName, storeName, version);
    }
    return dbPromise;
  };

  return {
    async get(key: string): Promise<string | undefined> {
      const db = await getDb();
      return new Promise<string | undefined>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          resolve(typeof result === "string" ? result : undefined);
        };
        request.onerror = () => {
          reject(request.error ?? new Error("IndexedDB get failed"));
        };
      });
    },
    async set(key: string, value: string): Promise<void> {
      const db = await getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const request = store.put(value, key);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          reject(request.error ?? new Error("IndexedDB set failed"));
        };
      });
    },
  };
}

function getRuntimeLocalStorage(): StorageLike {
  const runtime = globalThis as { localStorage?: StorageLike };
  if (!runtime.localStorage) {
    throw new Error("localStorage is not available in this runtime");
  }
  return runtime.localStorage;
}

function getRuntimeIndexedDB(): IndexedDBLike {
  const runtime = globalThis as { indexedDB?: IndexedDBLike };
  if (!runtime.indexedDB) {
    throw new Error("indexedDB is not available in this runtime");
  }
  return runtime.indexedDB;
}

function openIndexedDB(
  indexedDBFactory: IndexedDBLike,
  dbName: string,
  storeName: string,
  version: number,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = indexedDBFactory.open(dbName, version);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open IndexedDB"));
    };
  });
}
