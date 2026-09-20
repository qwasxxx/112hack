import {
  USERS_STORE,
  openSys112Db,
  requestToPromise,
  waitForTransaction,
} from '../local-db/open';

export async function readAllUsers<T>(): Promise<T[]> {
  const db = await openSys112Db();
  try {
    const tx = db.transaction(USERS_STORE, 'readonly');
    const rows = await requestToPromise(tx.objectStore(USERS_STORE).getAll());
    return (Array.isArray(rows) ? rows : []) as T[];
  } finally {
    db.close();
  }
}

export async function writeAllUsers<T extends { id: string }>(users: T[]): Promise<void> {
  const db = await openSys112Db();
  try {
    const tx = db.transaction(USERS_STORE, 'readwrite');
    const store = tx.objectStore(USERS_STORE);
    await requestToPromise(store.clear());
    await Promise.all(users.map((user) => requestToPromise(store.put(user))));
    await waitForTransaction(tx);
  } finally {
    db.close();
  }
}
