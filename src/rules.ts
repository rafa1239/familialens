import { DataState, Relationship, ValidationResult } from "./types";

export function validateRelationship(data: DataState, rel: Relationship): ValidationResult {
  if (!data.people[rel.from] || !data.people[rel.to]) {
    return { ok: false, reason: "Both people must exist before linking." };
  }

  if (rel.from === rel.to) {
    return { ok: false, reason: "A person cannot be linked to themselves." };
  }

  if (rel.type === "spouse") {
    for (const existing of Object.values(data.relationships)) {
      if (existing.type !== "spouse") continue;
      const a = [existing.from, existing.to].sort().join(":");
      const b = [rel.from, rel.to].sort().join(":");
      if (a === b) {
        return { ok: false, reason: "These two people are already spouses." };
      }
    }
    return { ok: true };
  }

  if (rel.type === "parent") {
    for (const existing of Object.values(data.relationships)) {
      if (existing.type !== "parent") continue;
      if (existing.from === rel.from && existing.to === rel.to) {
        return { ok: false, reason: "That parent-child relationship already exists." };
      }
    }

    const parentCount = Object.values(data.relationships).filter(
      (existing) => existing.type === "parent" && existing.to === rel.to
    ).length;

    if (parentCount >= 2) {
      return { ok: false, reason: "A child cannot have more than two parents." };
    }

    if (createsCycle(data, rel.from, rel.to)) {
      return { ok: false, reason: "That link would create a cycle in the tree." };
    }

    return { ok: true };
  }

  return { ok: false, reason: "Unknown relationship type." };
}

function createsCycle(data: DataState, parentId: string, childId: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const rel of Object.values(data.relationships)) {
    if (rel.type !== "parent") continue;
    if (!adjacency.has(rel.from)) adjacency.set(rel.from, []);
    adjacency.get(rel.from)!.push(rel.to);
  }

  const stack = [childId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === parentId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const children = adjacency.get(current) ?? [];
    for (const child of children) {
      if (!visited.has(child)) {
        stack.push(child);
      }
    }
  }
  return false;
}
