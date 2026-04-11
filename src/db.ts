import { openDB, type IDBPDatabase } from "idb";
import type { DataState } from "./types";

const DB_NAME = "familialens_v7";
const DB_VERSION = 1;
const SNAPSHOT_KEY = "current";

interface Schema {
  snapshot: {
    key: string;
    value: DataState;
  };
  photos: {
    key: string;
    value: Blob;
  };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("snapshot")) {
          db.createObjectStore("snapshot");
        }
        if (!db.objectStoreNames.contains("photos")) {
          db.createObjectStore("photos");
        }
      }
    });
  }
  return dbPromise;
}

export async function loadSnapshot(): Promise<DataState | null> {
  try {
    const d = await db();
    const value = await d.get("snapshot", SNAPSHOT_KEY);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(snapshot: DataState): Promise<void> {
  const d = await db();
  await d.put("snapshot", snapshot, SNAPSHOT_KEY);
}

export async function savePhoto(id: string, blob: Blob): Promise<void> {
  const d = await db();
  await d.put("photos", blob, id);
}

export async function loadPhoto(id: string): Promise<Blob | undefined> {
  const d = await db();
  return await d.get("photos", id);
}

export async function deletePhoto(id: string): Promise<void> {
  const d = await db();
  await d.delete("photos", id);
}
