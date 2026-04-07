import { DataState, Operation } from "./types";

const DB_NAME = "familialens_v6";
const DB_VERSION = 1;
const SNAPSHOT_KEY = "current";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("snapshot")) {
        db.createObjectStore("snapshot");
      }
      if (!db.objectStoreNames.contains("oplog")) {
        db.createObjectStore("oplog", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function loadSnapshot(): Promise<DataState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("snapshot", "readonly");
    const store = tx.objectStore("snapshot");
    const req = store.get(SNAPSHOT_KEY);
    req.onsuccess = () => resolve((req.result as DataState) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSnapshot(snapshot: DataState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("snapshot", "readwrite");
    const store = tx.objectStore("snapshot");
    const req = store.put(snapshot, SNAPSHOT_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function appendOp(op: Operation): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("oplog", "readwrite");
    const store = tx.objectStore("oplog");
    const req = store.put(op);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
