import { DataState } from "../types";
import { migrateData } from "./migrate";

export function exportJson(data: DataState): string {
  return JSON.stringify(data, null, 2);
}

export function parseJson(
  raw: string
): { ok: true; data: DataState; warnings: string[] } | { ok: false; reason: string } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const migrated = migrateData(parsed);
    if (!migrated.ok) {
      return { ok: false, reason: migrated.reason };
    }
    return { ok: true, data: migrated.data, warnings: migrated.warnings };
  } catch {
    return { ok: false, reason: "Failed to parse JSON." };
  }
}
