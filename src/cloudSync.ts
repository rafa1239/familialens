import type { DataState } from "./types";

export type CloudSyncKind =
  | "locked"
  | "checking"
  | "pending"
  | "saving"
  | "saved"
  | "error";

export type CloudSyncState = {
  kind: CloudSyncKind;
  message: string;
  savedAt?: string;
};

export type AuthUser = {
  id: string;
  username: string;
  createdAt?: string;
};

export type AuthSession = {
  authenticated: boolean;
  user: AuthUser | null;
  canRegister: boolean;
};

export type CloudBackup = {
  snapshot: DataState;
  savedAt: string;
};

export const CLOUD_LOCKED: CloudSyncState = {
  kind: "locked",
  message: "Sign in to save online"
};

export async function getAuthSession(): Promise<AuthSession> {
  const response = await fetch(apiEndpoint("auth/session"), {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  if (!response.ok) throw new Error(await responseMessage(response));
  const payload = await response.json() as Partial<AuthSession>;
  return {
    authenticated: !!payload.authenticated,
    user: payload.user ?? null,
    canRegister: !!payload.canRegister
  };
}

export async function loginOnline(
  username: string,
  password: string
): Promise<AuthUser> {
  return authenticate("auth/login", username, password);
}

export async function registerOnline(
  username: string,
  password: string
): Promise<AuthUser> {
  return authenticate("auth/register", username, password);
}

export async function logoutOnline(): Promise<void> {
  const response = await fetch(apiEndpoint("auth/logout"), {
    method: "POST",
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(await responseMessage(response));
}

export async function loadCloudBackup(): Promise<CloudBackup | null> {
  const response = await fetch(apiEndpoint("snapshot"), {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await responseMessage(response));

  const payload = await response.json() as Partial<CloudBackup>;
  if (!payload.snapshot || !payload.savedAt) {
    throw new Error("Online response was incomplete.");
  }
  return {
    snapshot: payload.snapshot,
    savedAt: payload.savedAt
  };
}

export async function saveCloudBackup(snapshot: DataState): Promise<CloudBackup> {
  const response = await fetch(apiEndpoint("snapshot"), {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ snapshot })
  });

  if (!response.ok) throw new Error(await responseMessage(response));

  const payload = await response.json() as Partial<CloudBackup>;
  if (!payload.savedAt) throw new Error("Online save response was incomplete.");
  return {
    snapshot,
    savedAt: payload.savedAt
  };
}

async function authenticate(
  path: string,
  username: string,
  password: string
): Promise<AuthUser> {
  const response = await fetch(apiEndpoint(path), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) throw new Error(await responseMessage(response));
  const payload = await response.json() as { user?: AuthUser };
  if (!payload.user) throw new Error("Login response was incomplete.");
  return payload.user;
}

function apiEndpoint(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const cleanPath = path.replace(/^\/+/, "");
  if (typeof window === "undefined") return `${base}api/${cleanPath}`;
  return new URL(
    `${base.replace(/\/?$/, "/")}api/${cleanPath}`,
    window.location.origin
  ).toString();
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { reason?: string; message?: string };
    return body.reason || body.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}
