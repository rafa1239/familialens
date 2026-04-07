import { DataState, Relationship } from "../types";

export type ValidationReport = {
  people: number;
  relationships: number;
  parentLinks: number;
  spouseLinks: number;
  warnings: string[];
  errors: string[];
};

export function validateData(data: DataState): ValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  const peopleIds = new Set(Object.keys(data.people));
  const relationships = Object.values(data.relationships);
  const birthYears = new Map<string, number>();

  let parentLinks = 0;
  let spouseLinks = 0;

  const parentCount: Record<string, number> = {};
  const spousePairs = new Set<string>();
  const parentPairs = new Set<string>();

  for (const rel of relationships) {
    if (rel.type !== "parent" && rel.type !== "spouse") {
      errors.push(`Relationship ${rel.id} has unknown type.`);
      continue;
    }
    if (!peopleIds.has(rel.from) || !peopleIds.has(rel.to)) {
      errors.push(`Relationship ${rel.id} references missing people.`);
      continue;
    }
    if (rel.from === rel.to) {
      errors.push(`Relationship ${rel.id} links a person to themselves.`);
      continue;
    }

    if (rel.type === "parent") {
      parentLinks += 1;
      parentCount[rel.to] = (parentCount[rel.to] ?? 0) + 1;
      const key = `${rel.from}->${rel.to}`;
      if (parentPairs.has(key)) {
        warnings.push(`Duplicate parent link between ${rel.from} and ${rel.to}.`);
      }
      parentPairs.add(key);
    }

    if (rel.type === "spouse") {
      spouseLinks += 1;
      const key = [rel.from, rel.to].sort().join(":");
      if (spousePairs.has(key)) {
        warnings.push(`Duplicate spouse link between ${rel.from} and ${rel.to}.`);
      }
      spousePairs.add(key);
    }
  }

  for (const person of Object.values(data.people)) {
    if (!person.name.trim()) {
      warnings.push(`Person ${person.id} is missing a name.`);
    }
    if (person.birthDate && !isDateLike(person.birthDate)) {
      warnings.push(`Person ${person.id} has an invalid birth date.`);
    }
    if (person.deathDate && !isDateLike(person.deathDate)) {
      warnings.push(`Person ${person.id} has an invalid death date.`);
    }
    const birthYear = extractYear(person.birthDate);
    if (birthYear !== null) birthYears.set(person.id, birthYear);
    const deathYear = extractYear(person.deathDate);
    if (birthYear !== null && deathYear !== null && deathYear < birthYear) {
      warnings.push(`Person ${person.id} has death before birth.`);
    }
  }

  for (const rel of relationships) {
    if (rel.type !== "parent") continue;
    const parentYear = birthYears.get(rel.from);
    const childYear = birthYears.get(rel.to);
    if (parentYear !== undefined && childYear !== undefined && parentYear > childYear) {
      warnings.push(`Parent ${rel.from} appears younger than child ${rel.to}.`);
    }
  }

  for (const [childId, count] of Object.entries(parentCount)) {
    if (count > 2) {
      warnings.push(`Person ${childId} has more than two parents.`);
    }
  }

  const duplicateNames = findDuplicateNames(data);
  if (duplicateNames.length > 0) {
    warnings.push(`Duplicate names detected: ${duplicateNames.slice(0, 3).join(", ")}`);
  }

  if (hasParentCycle(relationships)) {
    warnings.push("Parent relationships include a cycle.");
  }

  return {
    people: peopleIds.size,
    relationships: relationships.length,
    parentLinks,
    spouseLinks,
    warnings,
    errors
  };
}

function findDuplicateNames(data: DataState): string[] {
  const counts = new Map<string, number>();
  for (const person of Object.values(data.people)) {
    const name = person.name.trim().toLowerCase();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}

function hasParentCycle(relationships: Relationship[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const rel of relationships) {
    if (rel.type !== "parent") continue;
    if (!adjacency.has(rel.from)) adjacency.set(rel.from, []);
    adjacency.get(rel.from)!.push(rel.to);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of adjacency.get(node) ?? []) {
      if (dfs(child)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of adjacency.keys()) {
    if (dfs(node)) return true;
  }
  return false;
}

function extractYear(value: string): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function isDateLike(value: string): boolean {
  return /^\d{4}(-\d{2})?(-\d{2})?$/.test(value.trim());
}
