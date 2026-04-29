import type { DataState } from "./types";

const CLOUD_KEY_STORAGE = "familialens:v8-cloud-key";

export type CloudSyncKind =
  | "locked"
  | "checking"
  | "saving"
  | "saved"
  | "local"
  | "error";

export type CloudSyncState = {
  kind: CloudSyncKind;
  message: string;
  savedAt?: string;
};

export type CloudBackup = {
  snapshot: DataState;
  savedAt: string;
};

export const CLOUD_LOCKED: CloudSyncState = {
  kind: "locked",
  message: "Cloud locked"
};

export function readCloudKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(CLOUD_KEY_STORAGE)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeCloudKey(value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLOUD_KEY_STORAGE, value.trim());
}

export function clearCloudKey(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CLOUD_KEY_STORAGE);
}

export function hasCloudKey(): boolean {
  return !!readCloudKey();
}

export async function loadCloudBackup(): Promise<CloudBackup | null> {
  const key = readCloudKey();
  if (!key) return null;

  const response = await fetch(cloudEndpoint(), {
    method: "GET",
    headers: authHeaders(key),
    cache: "no-store"
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await responseMessage(response));

  const payload = await response.json() as Partial<CloudBackup>;
  if (!payload.snapshot || !payload.savedAt) {
    throw new Error("Cloud response was incomplete.");
  }
  return {
    snapshot: payload.snapshot,
    savedAt: payload.savedAt
  };
}

export async function saveCloudBackup(snapshot: DataState): Promise<CloudBackup> {
  const key = readCloudKey();
  if (!key) throw new Error("Cloud save key is missing.");

  const response = await fetch(cloudEndpoint(), {
    method: "PUT",
    headers: {
      ...authHeaders(key),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ snapshot })
  });

  if (!response.ok) throw new Error(await responseMessage(response));

  const payload = await response.json() as Partial<CloudBackup>;
  if (!payload.savedAt) throw new Error("Cloud save response was incomplete.");
  return {
    snapshot,
    savedAt: payload.savedAt
  };
}

export function newerSnapshot(
  localSnapshot: DataState | null,
  cloudSnapshot: DataState | null
): DataState | null {
  if (!localSnapshot) return cloudSnapshot;
  if (!cloudSnapshot) return localSnapshot;
  return timestampOf(cloudSnapshot.updatedAt) > timestampOf(localSnapshot.updatedAt)
    ? cloudSnapshot
    : localSnapshot;
}

function cloudEndpoint(): string {
  const base = import.meta.env.BASE_URL || "/";
  if (typeof window === "undefined") return `${base}api/snapshot`;
  return new URL(`${base.replace(/\/?$/, "/")}api/snapshot`, window.location.origin).toString();
}

function authHeaders(key: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`
  };
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { reason?: string; message?: string };
    return body.reason || body.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function timestampOf(value: string | undefined): number {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}
