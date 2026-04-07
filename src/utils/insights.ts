import type { DataState, FocusMode, Relationship } from "../types";
import type { ValidationReport } from "./validate";

export type DatasetInsights = {
  livingPeople: number;
  rootPeople: number;
  isolatedPeople: number;
  spousePairs: number;
  duplicateNames: string[];
  generations: number;
};

export function parseYearInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const year = Number(trimmed);
  if (!Number.isFinite(year)) return null;
  return year;
}

export function extractYear(value: string): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

export function computeFocusSet(
  relationships: Relationship[],
  selectedId: string,
  mode: Exclude<FocusMode, "all">
): Set<string> {
  const parentsMap = new Map<string, string[]>();
  const childrenMap = new Map<string, string[]>();
  const spouseMap = new Map<string, string[]>();

  for (const rel of relationships) {
    if (rel.type === "parent") {
      if (!parentsMap.has(rel.to)) parentsMap.set(rel.to, []);
      parentsMap.get(rel.to)!.push(rel.from);
      if (!childrenMap.has(rel.from)) childrenMap.set(rel.from, []);
      childrenMap.get(rel.from)!.push(rel.to);
      continue;
    }
    if (!spouseMap.has(rel.from)) spouseMap.set(rel.from, []);
    if (!spouseMap.has(rel.to)) spouseMap.set(rel.to, []);
    spouseMap.get(rel.from)!.push(rel.to);
    spouseMap.get(rel.to)!.push(rel.from);
  }

  const visited = new Set<string>([selectedId]);
  const queue = [selectedId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const next =
      mode === "ancestors" ? parentsMap.get(current) : childrenMap.get(current);
    if (!next) continue;
    for (const id of next) {
      if (visited.has(id)) continue;
      visited.add(id);
      queue.push(id);
    }
  }

  for (const id of Array.from(visited)) {
    const spouses = spouseMap.get(id) ?? [];
    for (const spouseId of spouses) {
      visited.add(spouseId);
    }
  }

  return visited;
}

export function computeDatasetInsights(
  data: DataState,
  report: ValidationReport
): DatasetInsights {
  const parents = new Set<string>();
  const linked = new Set<string>();
  const spousePairs = new Set<string>();

  const parentsMap = new Map<string, Set<string>>();

  for (const rel of Object.values(data.relationships)) {
    linked.add(rel.from);
    linked.add(rel.to);
    if (rel.type === "parent") {
      parents.add(rel.to);
      if (!parentsMap.has(rel.to)) parentsMap.set(rel.to, new Set());
      parentsMap.get(rel.to)!.add(rel.from);
      continue;
    }
    spousePairs.add([rel.from, rel.to].sort().join(":"));
  }

  // Count generations
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const pars = parentsMap.get(id);
    if (!pars || pars.size === 0) {
      memo.set(id, 0);
      visiting.delete(id);
      return 0;
    }
    let maxD = 0;
    for (const p of pars) maxD = Math.max(maxD, depthOf(p) + 1);
    memo.set(id, maxD);
    visiting.delete(id);
    return maxD;
  };
  let maxGen = 0;
  for (const id of Object.keys(data.people)) {
    maxGen = Math.max(maxGen, depthOf(id));
  }

  const duplicateNames =
    report.warnings
      .find((w) => w.startsWith("Duplicate names detected: "))
      ?.replace("Duplicate names detected: ", "")
      .split(", ")
      .filter(Boolean) ?? [];

  const people = Object.values(data.people);
  return {
    livingPeople: people.filter((p) => !p.deathDate.trim()).length,
    rootPeople: people.filter((p) => !parents.has(p.id)).length,
    isolatedPeople: people.filter((p) => !linked.has(p.id)).length,
    spousePairs: spousePairs.size,
    duplicateNames,
    generations: maxGen + 1
  };
}

export function getGenerationDepth(
  data: DataState
): Map<string, number> {
  const parentsMap = new Map<string, Set<string>>();
  for (const rel of Object.values(data.relationships)) {
    if (rel.type !== "parent") continue;
    if (!parentsMap.has(rel.to)) parentsMap.set(rel.to, new Set());
    parentsMap.get(rel.to)!.add(rel.from);
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const pars = parentsMap.get(id);
    if (!pars || pars.size === 0) {
      memo.set(id, 0);
      visiting.delete(id);
      return 0;
    }
    let maxD = 0;
    for (const p of pars) maxD = Math.max(maxD, depthOf(p) + 1);
    memo.set(id, maxD);
    visiting.delete(id);
    return maxD;
  };

  for (const id of Object.keys(data.people)) depthOf(id);
  return memo;
}
