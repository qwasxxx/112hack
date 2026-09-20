export const SYS112_DB_NAME = 'sys112-local-auth';
export const SYS112_DB_VERSION = 2;

export const USERS_STORE = 'users';
export const ADMIN_SERVICES_STORE = 'adminServices';
export const ADMIN_SETTINGS_STORE = 'adminSettings';
export const ADMIN_AUDIT_STORE = 'adminAudit';
export const ADMIN_BACKUPS_STORE = 'adminBackups';
export const ADMIN_TRAINING_STORE = 'adminTraining';

function ensureStore(db: IDBDatabase, name: string, keyPath = 'id') {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name, { keyPath });
  }
}

function ensureUsersStore(db: IDBDatabase) {
  if (db.objectStoreNames.contains(USERS_STORE)) {
    return;
  }
  const store = db.createObjectStore(USERS_STORE, { keyPath: 'id' });
  store.createIndex('login', 'login', { unique: true });
  store.createIndex('email', 'email', { unique: true });
}

export function ensureSys112Stores(db: IDBDatabase) {
  ensureUsersStore(db);
  ensureStore(db, ADMIN_SERVICES_STORE);
  ensureStore(db, ADMIN_SETTINGS_STORE);
  ensureStore(db, ADMIN_AUDIT_STORE);
  ensureStore(db, ADMIN_BACKUPS_STORE);
  ensureStore(db, ADMIN_TRAINING_STORE, 'userId');
}

export function openSys112Db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYS112_DB_NAME, SYS112_DB_VERSION);
    request.onupgradeneeded = () => {
      ensureSys112Stores(request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
  });
}

export async function readAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openSys112Db();
  try {
    if (!db.objectStoreNames.contains(storeName)) {
      return [];
    }
    const tx = db.transaction(storeName, 'readonly');
    const rows = await requestToPromise(tx.objectStore(storeName).getAll());
    return (Array.isArray(rows) ? rows : []) as T[];
  } finally {
    db.close();
  }
}

export async function writeAllToStore<T>(storeName: string, rows: T[]): Promise<void> {
  const db = await openSys112Db();
  try {
    if (!db.objectStoreNames.contains(storeName)) {
      return;
    }
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await requestToPromise(store.clear());
    await Promise.all(rows.map((row) => requestToPromise(store.put(row))));
    await waitForTransaction(tx);
  } finally {
    db.close();
  }
}

export async function putInStore<T extends { id: string }>(storeName: string, row: T): Promise<void> {
  const db = await openSys112Db();
  try {
    if (!db.objectStoreNames.contains(storeName)) {
      return;
    }
    const tx = db.transaction(storeName, 'readwrite');
    await requestToPromise(tx.objectStore(storeName).put(row));
    await waitForTransaction(tx);
  } finally {
    db.close();
  }
}
