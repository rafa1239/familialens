const CLIENT_KEY = "familialens.clientId";

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function getClientId(): string {
  if (typeof localStorage === "undefined") {
    return "client_local";
  }
  const existing = localStorage.getItem(CLIENT_KEY);
  if (existing) return existing;
  const next = createId("client");
  localStorage.setItem(CLIENT_KEY, next);
  return next;
}
