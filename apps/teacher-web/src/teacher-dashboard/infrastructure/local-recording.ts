const DB = 'sys112-recordings';
const STORE = 'blobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB'));
  });
}

export function saveLocalRecording(lessonId: string, blob: Blob): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(blob, lessonId);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('indexedDB'));
        };
      }),
  );
}

export function loadLocalRecording(lessonId: string): Promise<Blob | null> {
  return openDb()
    .then(
      (db) =>
        new Promise<Blob | null>((resolve) => {
          const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(lessonId);
          request.onsuccess = () => {
            db.close();
            resolve(request.result instanceof Blob ? request.result : null);
          };
          request.onerror = () => {
            db.close();
            resolve(null);
          };
        }),
    )
    .catch(() => null);
}
