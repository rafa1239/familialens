import { DataState, Person, Relationship } from "../types";
import { createId, nowIso } from "../ids";
import { validateRelationship } from "../rules";

export type MergeMode = "keep" | "replace" | "both";
export type ImportStrategy = "replace" | "merge-keep" | "merge-replace" | "merge-both";

export type MergeResult = {
  data: DataState;
  warnings: string[];
  conflicts: string[];
};

export function strategyToMode(strategy: ImportStrategy): MergeMode | null {
  if (strategy === "merge-keep") return "keep";
  if (strategy === "merge-replace") return "replace";
  if (strategy === "merge-both") return "both";
  return null;
}

export function findConflicts(current: DataState, incoming: DataState): string[] {
  const currentNames = new Set<string>();
  for (const person of Object.values(current.people)) {
    const normalized = normalizeName(person.name);
    if (normalized) currentNames.add(normalized);
  }
  const conflicts = new Set<string>();
  for (const person of Object.values(incoming.people)) {
    const normalized = normalizeName(person.name);
    if (normalized && currentNames.has(normalized)) {
      conflicts.add(person.name.trim() || normalized);
    }
  }
  return Array.from(conflicts);
}

export function mergeData(current: DataState, incoming: DataState, mode: MergeMode): MergeResult {
  const warnings: string[] = [];
  const conflicts = findConflicts(current, incoming);

  const mergedPeople: Record<string, Person> = { ...current.people };
  const mergedRelationships: Record<string, Relationship> = { ...current.relationships };

  const nameToId = new Map<string, string>();
  for (const person of Object.values(current.people)) {
    const normalized = normalizeName(person.name);
    if (normalized && !nameToId.has(normalized)) nameToId.set(normalized, person.id);
  }

  const existingBounds = getBounds(current.people);
  const incomingBounds = getBounds(incoming.people);
  const shiftX =
    existingBounds && incomingBounds
      ? existingBounds.maxX - incomingBounds.minX + 200
      : 0;

  const idMap = new Map<string, string>();

  for (const person of Object.values(incoming.people)) {
    const normalized = normalizeName(person.name);
    const existingId = normalized ? nameToId.get(normalized) : undefined;
    const hasConflict = Boolean(existingId);

    if (existingId && mode !== "both") {
      idMap.set(person.id, existingId);
      if (mode === "replace") {
        const existing = mergedPeople[existingId];
        mergedPeople[existingId] = {
          ...person,
          id: existingId,
          x: existing?.x ?? person.x,
          y: existing?.y ?? person.y,
          pinned: existing?.pinned ?? person.pinned
        };
      }
      continue;
    }

    const nextId = createId("person");
    idMap.set(person.id, nextId);
    const displayName =
      hasConflict && mode === "both" ? `${person.name || "Unnamed"} (import)` : person.name;
    mergedPeople[nextId] = {
      ...person,
      id: nextId,
      name: displayName,
      x: person.x + shiftX,
      y: person.y
    };
  }

  const relationshipKeys = new Set<string>();
  for (const rel of Object.values(mergedRelationships)) {
    relationshipKeys.add(relationshipKey(rel));
  }

  const tempData: DataState = {
    ...current,
    people: mergedPeople,
    relationships: mergedRelationships
  };

  for (const rel of Object.values(incoming.relationships)) {
    const from = idMap.get(rel.from);
    const to = idMap.get(rel.to);
    if (!from || !to) {
      warnings.push(`Skipped relationship ${rel.id} (missing people after merge).`);
      continue;
    }
    const nextRel: Relationship = { id: createId("rel"), type: rel.type, from, to };
    const key = relationshipKey(nextRel);
    if (relationshipKeys.has(key)) {
      warnings.push(`Skipped duplicate relationship (${rel.type}) between ${from} and ${to}.`);
      continue;
    }
    const result = validateRelationship(tempData, nextRel);
    if (!result.ok) {
      warnings.push(`Skipped relationship (${rel.type}): ${result.reason}`);
      continue;
    }
    mergedRelationships[nextRel.id] = nextRel;
    relationshipKeys.add(key);
  }

  return {
    data: { ...current, updatedAt: nowIso(), people: mergedPeople, relationships: mergedRelationships },
    warnings,
    conflicts
  };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function getBounds(people: Record<string, Person>) {
  const list = Object.values(people);
  if (list.length === 0) return null;
  const xs = list.map((p) => p.x);
  const ys = list.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function relationshipKey(rel: Relationship): string {
  if (rel.type === "spouse") return `spouse:${[rel.from, rel.to].sort().join(":")}`;
  return `parent:${rel.from}->${rel.to}`;
}
