import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'financehub-offline';
const DB_VERSION = 1;

export interface OfflineDB {
  wallets: { key: number; value: any };
  actions: { key: number; value: any };
  budgets: { key: number; value: any };
  categories: { key: number; value: any };
  goals: { key: number; value: any };
  meta: { key: string; value: any };
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('wallets')) db.createObjectStore('wallets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('actions')) db.createObjectStore('actions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('budgets')) db.createObjectStore('budgets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      },
    });
  }
  return dbPromise;
}

export async function cacheEntities(store: keyof OfflineDB, items: any[]): Promise<void> {
  try {
    const db = await getOfflineDb();
    const tx = db.transaction(store, 'readwrite');
    await tx.store.clear();
    for (const it of items) {
      if (it && typeof it.id !== 'undefined') await tx.store.put(it);
    }
    await tx.done;
    const meta = db.transaction('meta', 'readwrite');
    await meta.store.put(Date.now(), `${store}:updated_at`);
    await meta.done;
  } catch {
    // ignore
  }
}

export async function getCachedEntities<T = any>(store: keyof OfflineDB): Promise<T[]> {
  try {
    const db = await getOfflineDb();
    return (await db.getAll(store)) as T[];
  } catch {
    return [];
  }
}

export async function cacheMeta(key: string, value: any): Promise<void> {
  try {
    const db = await getOfflineDb();
    await db.put('meta', value, key);
  } catch {
    // ignore
  }
}

export async function getMeta<T = any>(key: string): Promise<T | undefined> {
  try {
    const db = await getOfflineDb();
    return await db.get('meta', key) as T | undefined;
  } catch {
    return undefined;
  }
}